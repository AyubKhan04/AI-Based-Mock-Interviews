from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import notify, scoring
from app.db import SessionLocal
from app.models import Interview, now

SENT = []


@pytest.fixture()
def client(monkeypatch):
    SENT.clear()
    monkeypatch.setattr(notify.emailer, "send", lambda to, subject, html, att=None: SENT.append(subject) or True)
    with TestClient(main.app) as c:
        yield c


def login(c, email):
    r = c.post("/auth/signup", json={"name": "Ravi", "email": email, "password": "secret123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def fixed_scores(monkeypatch, value):
    def fake(**kw):
        res = {"content": value, "communication": value, "thought_process": value, "went_well": "ok",
               "to_improve": "more detail", "example_answer": "An example.", "vague": False, "followup": ""}
        if kw["include_attitude"]:
            res["attitude"] = value
        return res
    monkeypatch.setattr(scoring, "heuristic_eval", fake)
    monkeypatch.setattr(main.scoring, "heuristic_eval", fake)


ANSWER = "I would start by understanding the goal, then compare two options and pick the simpler one because it is easier to maintain."


def play_round(c, h, iid, order):
    s = c.post(f"/interviews/{iid}/rounds/{order}/start", headers=h)
    assert s.status_code == 200, s.text
    r = s.json()
    while True:
        r = c.post(f"/interviews/{iid}/answer", headers=h, json={"text": ANSWER}).json()
        if r.get("round_finished"):
            return r


def test_mock_mode_passes_all_rounds(client, monkeypatch):
    fixed_scores(monkeypatch, 9.0)
    h = login(client, "mock@example.com")
    st = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Software Engineer", "company": "Zoho"}).json()
    assert [r["questions"] for r in st["rounds"]] == [3, 3, 3, 3]          # ¼ of 12
    assert st["rounds"][0]["status"] == "ready" and st["expires_at"]
    # only one mock at a time
    assert client.post("/interviews", headers=h, json={"mode": "mock", "role": "Software Engineer"}).status_code == 409
    iid = st["interview_id"]
    assert client.post(f"/interviews/{iid}/rounds/2/start", headers=h).status_code == 409  # locked
    for order in (1, 2, 3, 4):
        r = play_round(client, h, iid, order)
    assert r["status"] == "completed"
    rep = client.get(f"/interviews/{iid}/report", headers=h).json()
    assert rep["final"]["complete"] and rep["final"]["band"] == 9.0
    assert len(rep["final"]["strengths"]) == 3 and rep["final"]["practice_plan"]
    assert sum("Selected for" in s for s in SENT) == 3 and any(s.startswith("Final report") for s in SENT)
    assert client.get(f"/interviews/{iid}/report.pdf", headers=h).content[:4] == b"%PDF"


def test_mock_fail_stops_and_expiry(client, monkeypatch):
    fixed_scores(monkeypatch, 4.0)  # screening pass mark is 5
    h = login(client, "fail@example.com")
    iid = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Data Analyst"}).json()["interview_id"]
    r = play_round(client, h, iid, 1)
    assert r["status"] == "failed" and r["rounds"][0]["passed"] is False
    assert any("Screening round feedback" in s for s in SENT)
    assert client.post(f"/interviews/{iid}/rounds/2/start", headers=h).status_code == 409

    iid2 = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Data Analyst"}).json()["interview_id"]
    with SessionLocal() as db:
        db.get(Interview, iid2).expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert client.get(f"/interviews/{iid2}", headers=h).json()["status"] == "expired"
    assert any("incomplete" in s for s in SENT)


def test_perform_scheduling_reminder_and_next_day(client, monkeypatch):
    fixed_scores(monkeypatch, 8.0)
    monkeypatch.setattr(main, "CRON_SECRET", "s3cret")
    h = login(client, "perform@example.com")
    client.put("/me", headers=h, json={"availability": {"days": [0, 1, 2, 3, 4, 5, 6], "start": "09:00", "end": "11:00", "tz": "Asia/Kolkata"}})
    st = client.post("/interviews", headers=h, json={"mode": "perform", "role": "Data Scientist"}).json()
    iid = st["interview_id"]
    assert [r["questions"] for r in st["rounds"]] == [12, 12, 12, 12]
    assert st["rounds"][0]["status"] == "scheduled" and st["rounds"][0]["scheduled_at"].endswith("03:30:00+00:00")  # 09:00 IST
    assert any("booked" in s for s in SENT)
    assert client.post(f"/interviews/{iid}/rounds/1/start", headers=h).status_code == 409  # too early
    assert client.post("/tasks/tick", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    with SessionLocal() as db:
        db.get(Interview, iid).rounds[0].scheduled_at = now() + timedelta(minutes=50)
        db.commit()
    assert client.post("/tasks/tick", headers={"X-Cron-Secret": "s3cret"}).json()["reminders"] == 1
    assert client.post("/tasks/tick", headers={"X-Cron-Secret": "s3cret"}).json()["reminders"] == 0  # only once
    with SessionLocal() as db:
        db.get(Interview, iid).rounds[0].scheduled_at = now() - timedelta(minutes=1)
        db.commit()
    r = play_round(client, h, iid, 1)
    nxt = r["rounds"][1]
    assert r["rounds"][0]["passed"] and nxt["status"] == "scheduled"
    assert nxt["scheduled_at"] > r["rounds"][0]["scheduled_at"]
    # a round not started within a day of its slot is missed and the interview expires
    with SessionLocal() as db:
        db.get(Interview, iid).rounds[1].scheduled_at = now() - timedelta(days=2)
        db.commit()
    assert client.post("/tasks/tick", headers={"X-Cron-Secret": "s3cret"}).json()["expired"] == 1
