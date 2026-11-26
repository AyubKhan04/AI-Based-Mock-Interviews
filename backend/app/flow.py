"""Multi-round interviews: Mock mode (company-based, ¼ questions, 1 day) and
Perform Mock Interview (common questions, full count, one round per day in the candidate's slots)."""
import math
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import questions
from .models import Answer, Interview, Question, Round, User, now

ROUNDS = ["screening", "technical", "behavioural", "hr"]
MOCK_HOURS = 24
START_EARLY = timedelta(minutes=15)   # a Perform round can be opened 15 minutes before its slot
MISS_AFTER = timedelta(hours=24)      # ...and is missed if not started within a day of it
DEFAULT_AVAILABILITY = {"days": [0, 1, 2, 3, 4, 5, 6], "start": "18:00", "end": "21:00", "tz": "Asia/Kolkata"}


def aware(dt: datetime | None) -> datetime | None:
    """SQLite gives back naive datetimes; treat them as UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def round_counts(profile: dict, round_type: str, mode: str) -> dict:
    """{'concept': n, 'coding': m}. Mock mode uses a quarter of the full count (rounded up)."""
    full = profile["full_counts"][round_type]
    full = full if isinstance(full, dict) else {"concept": full}
    if mode == "mock":
        return {k: math.ceil(v / 4) for k, v in full.items()}
    return dict(full)


def availability(user: User) -> dict:
    return {**DEFAULT_AVAILABILITY, **(user.availability or {})}


def next_slot(user: User, after: datetime) -> datetime:
    """First start-of-window slot on a preferred day, at or after `after`."""
    av = availability(user)
    tz = ZoneInfo(av["tz"])
    hh, mm = map(int, av["start"].split(":"))
    local = after.astimezone(tz)
    for i in range(15):
        d = (local + timedelta(days=i)).date()
        if d.weekday() in av["days"]:
            slot = datetime.combine(d, time(hh, mm), tzinfo=tz)
            if slot >= after:
                return slot.astimezone(timezone.utc)
    return (after + timedelta(days=1)).astimezone(timezone.utc)


def start_of_next_day(user: User, t: datetime) -> datetime:
    tz = ZoneInfo(availability(user)["tz"])
    d = t.astimezone(tz).date() + timedelta(days=1)
    return datetime.combine(d, time(0, 0), tzinfo=tz).astimezone(timezone.utc)


def fmt_local(user: User, dt: datetime) -> str:
    tz = ZoneInfo(availability(user)["tz"])
    return aware(dt).astimezone(tz).strftime("%A %d %B, %I:%M %p ") + availability(user)["tz"]


RESUME_QS = {"mock": 1, "perform": 3}
JD_QS = {"mock": 1, "perform": 4}


def create(db: Session, user: User, *, mode: str, field: str, role: str, company: str,
           style: dict | None = None, jd: str = "") -> Interview:
    active = [i for i in db.query(Interview).filter(Interview.user_id == user.id, Interview.mode == mode,
                                                     Interview.status == "in_progress")]
    for i in active:
        expire_if_due(db, i)
    if any(i.status == "in_progress" for i in active):
        raise HTTPException(409, f"Finish your current {'mock interview' if mode == 'mock' else 'Perform Mock Interview'} first")
    prof = questions.field_profile(field)
    iv = Interview(user_id=user.id, mode=mode, field=field, role=role, company=company if mode == "mock" else "Many companies",
                   difficulty="medium", style={"persona": "neutral", "panel": False, **(style or {})})
    if mode == "mock":
        iv.expires_at = now() + timedelta(hours=MOCK_HOURS)
    for order, rt in enumerate(ROUNDS, start=1):
        ids = []
        for kind, n in round_counts(prof, rt, mode).items():
            qs, _ = questions.pick(db, field=field, role=role, company=company, round_type=rt, difficulty="medium",
                                   n=n, kind=kind, common=(mode == "perform"))
            ids += [q.id for q in qs]
        if len(ids) < sum(round_counts(prof, rt, mode).values()):  # e.g. no coding problems: top up with concept questions
            extra, _ = questions.pick(db, field=field, role=role, company=company, round_type=rt, difficulty="medium",
                                      n=sum(round_counts(prof, rt, mode).values()) + len(ids), common=(mode == "perform"))
            ids += [q.id for q in extra if q.id not in ids][: sum(round_counts(prof, rt, mode).values()) - len(ids)]
        if rt == "screening" and user.resume_text:  # a real interviewer asks about your own resume
            mine = questions.resume_pick(db, user, field=field, role=role, n=RESUME_QS[mode])
            ids = ids[:1] + [q.id for q in mine] + ids[1:len(ids) - len(mine)]
        if rt == "technical" and jd:  # questions tailored to the pasted job post
            tailored, title = questions.jd_pick(db, jd=jd, field=field, role=role, n=JD_QS[mode])
            keep = [i for i in ids if db.get(Question, i).kind == "concept"][len(tailored):]
            ids = [i for i in ids if db.get(Question, i).kind != "concept"] + [q.id for q in tailored] + keep
            iv.style = {**(iv.style or {}), "jd_title": title}
        if rt == "hr":
            ids = ids + [questions.reverse_question(db, field).id]
        iv.rounds.append(Round(round_type=rt, order=order, question_ids=ids, status="locked",
                               pass_mark=prof["rounds"][rt]["pass_mark"]))
    first = iv.rounds[0]
    if mode == "mock":
        first.status = "ready"
    else:
        first.status, first.scheduled_at = "scheduled", next_slot(user, now() + timedelta(hours=1))
    db.add(iv)
    db.commit()
    return iv


def can_start(rnd: Round) -> tuple[bool, str]:
    iv = rnd.interview
    if iv.status != "in_progress":
        return False, "This interview is over"
    if rnd.status == "ready":
        return True, ""
    if rnd.status == "scheduled":
        opens = aware(rnd.scheduled_at) - START_EARLY
        if now() < opens:
            return False, "This round opens 15 minutes before its slot"
        return True, ""
    return False, "This round is not open"


def start_round(db: Session, iv: Interview, order: int) -> Round:
    expire_if_due(db, iv)
    rnd = next((r for r in iv.rounds if r.order == order), None)
    if not rnd:
        raise HTTPException(404, "Round not found")
    ok, why = can_start(rnd)
    if not ok:
        raise HTTPException(409, why)
    if not rnd.question_ids:
        raise HTTPException(503, "No questions available for this round yet")
    from .models import Question
    q = db.get(Question, rnd.question_ids[0])
    rnd.status, rnd.started_at = "in_progress", now()
    rnd.answers.append(Answer(question_id=q.id, question_text=q.text, modality="code" if q.kind == "coding" else "text"))
    db.commit()
    return rnd


def active_round(iv: Interview) -> Round | None:
    return next((r for r in iv.rounds if r.status == "in_progress"), None)


def after_round(db: Session, user: User, iv: Interview, rnd: Round) -> list[tuple[str, int]]:
    """Move the interview on after a scored round. Returns notifications to send: (kind, round order)."""
    if iv.mode == "practice":
        iv.status, iv.overall_score = "completed", rnd.score
        return [("practice", rnd.order)]
    if not rnd.passed:
        iv.status = "failed"
        iv.overall_score = overall(iv)
        return [("failed", rnd.order)]
    nxt = next((r for r in iv.rounds if r.order == rnd.order + 1), None)
    if not nxt:
        iv.status, iv.overall_score = "completed", overall(iv)
        return [("final", rnd.order)]
    if iv.mode == "mock":
        nxt.status = "ready"
    else:
        nxt.status, nxt.scheduled_at = "scheduled", next_slot(user, start_of_next_day(user, now()))
    return [("passed", rnd.order)]


def overall(iv: Interview) -> float | None:
    done = [r.score for r in iv.rounds if r.status == "completed" and r.score is not None]
    return round(sum(done) / len(done), 1) if done else None


def expire_if_due(db: Session, iv: Interview) -> bool:
    """Mock: unfinished after 1 day. Perform: a round not started within a day of its slot."""
    if iv.status != "in_progress" or iv.mode == "practice":
        return False
    t = now()
    due = iv.mode == "mock" and iv.expires_at and t > aware(iv.expires_at)
    for r in iv.rounds:
        if iv.mode == "perform" and r.status == "scheduled" and t > aware(r.scheduled_at) + MISS_AFTER:
            r.status, due = "missed", True
    if not due:
        return False
    for r in iv.rounds:
        if r.status == "in_progress":   # drop the unanswered question; keep what was answered
            r.answers[:] = [a for a in r.answers if a.answer_text is not None]
            r.status = "incomplete"
    iv.status, iv.overall_score = "expired", overall(iv)
    db.commit()
    return True


CHANCES = 3  # warnings allowed for each of: leaving the tab/fullscreen, camera off
LABEL = {"tab": "leaving the interview tab or fullscreen", "camera": "turning the camera off"}


def record_violation(db: Session, iv: Interview, kind: str, timed_out: bool) -> dict:
    """A proctoring issue during a Mock or Perform round. The first 3 of each kind are warnings;
    a 4th, or not fixing it before the timer ends, disqualifies the candidate."""
    rnd = active_round(iv)
    if iv.mode == "practice" or iv.status != "in_progress" or not rnd:
        raise HTTPException(409, "No proctored round is in progress")
    data = dict(iv.integrity or {"tab": 0, "camera": 0, "events": []})
    data["events"] = list(data.get("events", []))[-50:] + [{"kind": kind, "timed_out": timed_out, "at": now().isoformat(), "round": rnd.round_type}]
    reason = None
    if timed_out:
        reason = f"Disqualified: did not come back in time after {LABEL[kind]}."
    else:
        data[kind] = data.get(kind, 0) + 1
        if data[kind] > CHANCES:
            reason = f"Disqualified: used all {CHANCES} chances for {LABEL[kind]}."
    iv.integrity = data
    if reason:
        rnd.answers[:] = [a for a in rnd.answers if a.answer_text is not None]
        rnd.status, rnd.passed, rnd.finished_at = "disqualified", False, now()
        iv.status, iv.disqualified_reason, iv.overall_score = "failed", reason, overall(iv)
    db.commit()
    return {"tab": data["tab"], "camera": data["camera"], "chances": CHANCES, "disqualified": bool(reason), "reason": reason}
