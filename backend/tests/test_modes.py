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
    for _ in range(40):
        body = {"text": ANSWER}
        if r.get("kind") == "coding":
            body["code"] = {"code": "def f(): pass", "tests_passed": 5, "tests_total": 5, "runs": 1, "seconds": 60}
        r = c.post(f"/interviews/{iid}/answer", headers=h, json=body)
        assert r.status_code == 200, r.text
        r = r.json()
        if r.get("round_finished"):
            return r
    raise AssertionError("round never finished")


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
    assert client.get(f"/interviews/{iid}/report.xlsx", headers=h).content[:2] == b"PK"
    prog = client.get("/progress", headers=h).json()
    assert len(prog["timeline"]) == 4 and prog["funnel"]["mock"]["passed"] == [1, 1, 1, 1]
    assert {s["key"] for s in prog["skills"]} >= {"content", "tone", "attitude"}


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


def test_other_fields_work(client):
    h = login(client, "fields@example.com")
    cat = client.get("/catalog").json()
    assert [f["key"] for f in cat["fields"]] == ["tech", "finance", "sales", "hr"]
    for f in cat["fields"][1:]:
        r = client.post("/practice", headers=h, json={"field": f["key"], "role": f["roles"][0], "round_type": "technical", "count": 5})
        assert r.status_code == 200, r.text
        client.post(f"/interviews/{r.json()['interview_id']}/answer", headers=h, json={"text": "My answer."})
    r = client.put("/me", headers=h, json={"fields": [{"field": "sales", "role": "Account Manager"}, {"field": "tech", "role": "Data Analyst"}]})
    assert len(r.json()["fields"]) == 2
    assert client.put("/me", headers=h, json={"fields": [{"field": "sales", "role": "Data Analyst"}]}).status_code == 422


def test_coding_answer(client):
    h = login(client, "coder@example.com")
    r = client.post("/practice", headers=h, json={"role": "Software Engineer", "round_type": "technical", "kind": "coding", "count": 2}).json()
    assert r["kind"] == "coding" and r["coding"]["starter"].startswith("def ") and "hidden" not in r["coding"]
    iid = r["interview_id"]
    assert client.post(f"/interviews/{iid}/answer", headers=h, json={"text": "words only"}).status_code == 422
    tests = client.get(f"/interviews/{iid}/hidden-tests", headers=h).json()["tests"]
    good = {"code": "def f(): pass", "tests_passed": len(tests), "tests_total": len(tests), "runs": 2, "seconds": 300}
    r = client.post(f"/interviews/{iid}/answer", headers=h, json={"text": "I used a hash map so it runs in O(n) time because each lookup is O(1).", "code": good}).json()
    assert r["last_score"] >= 7
    r = client.post(f"/interviews/{iid}/answer", headers=h, json={"text": "", "code": {"skipped": True}}).json()
    assert r["status"] == "completed" and r["last_score"] < 4
    # coding is rejected outside the Tech technical round
    assert client.post("/practice", headers=h, json={"role": "Software Engineer", "round_type": "hr", "kind": "coding"}).status_code == 422


def test_mock_technical_round_has_coding(client):
    h = login(client, "mockcode@example.com")
    st = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Software Engineer"}).json()
    from app.models import Question
    with SessionLocal() as db:
        iv = db.get(Interview, st["interview_id"])
        kinds = [db.get(Question, q).kind for q in iv.rounds[1].question_ids]
    assert kinds.count("coding") == 1 and kinds.count("concept") == 2


def test_proctoring_strikes_and_disqualification(client, monkeypatch):
    fixed_scores(monkeypatch, 9.0)
    h = login(client, "proctor@example.com")
    iid = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Data Analyst"}).json()["interview_id"]
    assert client.post(f"/interviews/{iid}/integrity", headers=h, json={"kind": "tab"}).status_code == 409  # no round yet
    client.post(f"/interviews/{iid}/rounds/1/start", headers=h)
    for n in (1, 2, 3):
        r = client.post(f"/interviews/{iid}/integrity", headers=h, json={"kind": "tab"}).json()
        assert r["tab"] == n and not r["disqualified"]
    assert client.post(f"/interviews/{iid}/integrity", headers=h, json={"kind": "camera"}).json()["camera"] == 1  # counted separately
    st = client.get(f"/interviews/{iid}", headers=h).json()
    assert st["integrity"] == {"tab": 3, "camera": 1, "chances": 3}  # survives a reload
    r = client.post(f"/interviews/{iid}/integrity", headers=h, json={"kind": "tab"}).json()
    assert r["disqualified"] and "3 chances" in r["reason"]
    st = client.get(f"/interviews/{iid}", headers=h).json()
    assert st["status"] == "failed" and st["rounds"][0]["status"] == "disqualified"
    assert any("disqualified" in s for s in SENT)
    assert client.get(f"/interviews/{iid}/report", headers=h).json()["disqualified_reason"]

    # not coming back before the timer ends disqualifies straight away
    iid2 = client.post("/interviews", headers=h, json={"mode": "mock", "role": "Data Analyst"}).json()["interview_id"]
    client.post(f"/interviews/{iid2}/rounds/1/start", headers=h)
    r = client.post(f"/interviews/{iid2}/integrity", headers=h, json={"kind": "camera", "timed_out": True}).json()
    assert r["disqualified"] and "in time" in r["reason"]

    # practice is never proctored
    p = client.post("/practice", headers=h, json={"role": "Data Analyst", "round_type": "hr"}).json()
    assert p["proctored"] is False
    assert client.post(f"/interviews/{p['interview_id']}/integrity", headers=h, json={"kind": "tab"}).status_code == 409


def test_rounds_are_personalised_per_field(client):
    from app import questions
    from app.models import Question
    cat = client.get("/catalog").json()
    tech = {f["key"]: {r["type"]: r for r in f["rounds"]} for f in cat["fields"]}
    assert tech["tech"]["technical"]["full"] == "4 coding + 8 concept" and tech["tech"]["technical"]["label"] == "Technical"
    assert tech["sales"]["technical"] == {**tech["sales"]["technical"], "label": "Sales Skills", "full": "4 role-play + 8 concept", "mock": "1 role-play + 2 concept"}
    assert tech["finance"]["technical"]["full"] == "4 case / calculation + 8 concept"
    assert tech["hr"]["technical"]["label"] == "Functional HR" and tech["hr"]["screening"]["full"] == "12"
    special = {"tech": "coding", "sales": "roleplay", "finance": "case", "hr": "scenario"}
    for i, f in enumerate(cat["fields"]):
        for j, role in enumerate(f["roles"]):
            h = login(client, f"pf{i}{j}@example.com")
            iv = client.post("/interviews", json={"mode": "perform", "field": f["key"], "role": role}, headers=h).json()
            with SessionLocal() as db:
                obj = db.get(Interview, iv["interview_id"])
                for rnd in obj.rounds:
                    assert len(rnd.question_ids) == 12, (f["key"], role, rnd.round_type)
                    kinds = [db.get(Question, q).kind for q in rnd.question_ids]
                    if rnd.round_type == "technical":
                        assert kinds.count(special[f["key"]]) == 4 and kinds.count("concept") == 8, (f["key"], role, kinds)
                    else:
                        assert set(kinds) == {"concept"}
                    if f["key"] != "tech" and rnd.round_type != "technical":  # field-specific questions come first
                        texts = [db.get(Question, q).text for q in rnd.question_ids]
                        assert sum(t not in questions.SHARED for t in texts) >= 4
            client.delete(f"/interviews/{iv['interview_id']}", headers=h)
    h = login(client, "pfx@example.com")
    r = client.post("/practice", json={"field": "sales", "role": "Inside Sales", "round_type": "technical", "kind": "roleplay", "count": 3}, headers=h)
    assert r.status_code == 200 and r.json()["kind"] == "roleplay" and r.json()["coding"] is None
    assert client.post("/practice", json={"field": "sales", "role": "Inside Sales", "round_type": "technical", "kind": "coding", "count": 1}, headers=h).status_code == 422


RESUME = """Ravi Kumar | ravi@example.com | +91 98765 43210 | linkedin.com/in/ravi
Experience
Data Analyst Intern, Acme Retail (2024)
• Built a Power BI sales dashboard used by 40 store managers, cutting weekly reporting time by 6 hours
• Automated invoice matching in Python, reducing errors by 30%
Projects
• Developed a churn prediction model with 82% accuracy on 50,000 customers
Skills: SQL, Python, Excel"""


def test_resume_questions_guest_streaks_and_coaching(client):
    from app import achievements, questions
    from datetime import date
    h = login(client, "res@example.com")
    me = client.put("/me/resume", json={"text": RESUME}, headers=h).json()
    assert me["resume"]["chars"] > 50 and "ravi@example.com" not in me["resume"]["preview"] and "98765" not in me["resume"]["preview"]
    iv = client.post("/interviews", json={"mode": "perform", "field": "tech", "role": "Data Analyst"}, headers=h).json()
    with SessionLocal() as db:
        from app.models import Question
        scr = db.get(Interview, iv["interview_id"]).rounds[0]
        texts = [db.get(Question, q).text for q in scr.question_ids]
        assert len(texts) == 12 and sum(t.startswith(('Your resume', 'On your resume', 'Tell me more about \u201c', 'About \u201c')) for t in texts) == 3, texts
    # private: nobody else's practice pool sees resume questions
    h2 = login(client, "other@example.com")
    r = client.post("/practice", json={"field": "tech", "role": "Data Analyst", "round_type": "screening", "count": 15}, headers=h2).json()
    with SessionLocal() as db:
        from app.models import Question
        ids = db.get(Interview, r["interview_id"]).rounds[0].question_ids
        assert all(db.get(Question, q).company == "any" for q in ids)
    # practice coaching comes back after each answer
    a = client.post(f"/interviews/{r['interview_id']}/answer", json={"text": "In my last internship the task was to speed up reports. I built a dashboard and as a result we saved 6 hours a week."}, headers=h2).json()
    fb = a["feedback"]
    assert fb["coaching"]["star"] == {"situation": True, "task": True, "action": True, "result": True} and fb["coaching"]["outline"]
    assert fb["metrics"]["word_count"] > 10
    assert client.get("/progress", headers=h2).json()["badges"][0]["earned"] is True
    assert client.delete("/me/resume", headers=h).json()["resume"] is None
    # streak maths
    d = date(2026, 11, 26)
    assert achievements.streaks({d, d.replace(day=25), d.replace(day=24), d.replace(day=20)}, d) == {"current": 3, "best": 3, "today_done": True}
    assert achievements.streaks({d.replace(day=25)}, d)["current"] == 1
    # guest: can practise, cannot book Perform, can upgrade
    g = client.post("/auth/guest").json()
    gh = {"Authorization": f"Bearer {g['token']}"}
    assert g["user"]["is_guest"] is True
    assert client.post("/interviews", json={"mode": "perform", "field": "tech", "role": "Data Analyst"}, headers=gh).status_code == 403
    up = client.post("/auth/upgrade", json={"name": "Asha", "email": "asha.up@example.com", "password": "secret123"}, headers=gh).json()
    assert up["user"]["is_guest"] is False and up["user"]["email"] == "asha.up@example.com"
