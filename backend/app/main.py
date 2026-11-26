import logging
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, emailer, flow, notify, questions, report, scoring
from .config import CRON_SECRET, FRONTEND_ORIGINS
from .db import Base, SessionLocal, add_missing_columns, engine, get_db
from .models import Answer, Interview, Question, Round, User, UserField, now
from .security import check_password, current_user, hash_password, make_token

logging.basicConfig(level=logging.INFO)
ROUNDS = flow.ROUNDS


@asynccontextmanager
async def lifespan(_):
    Base.metadata.create_all(engine)
    add_missing_columns()
    with SessionLocal() as db:
        questions.seed(db)
    yield


app = FastAPI(title="AI Mock Interview Coach", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_methods=["*"], allow_headers=["*"])


# ---------- schemas ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class FieldRole(BaseModel):
    field: str
    role: str


class AvailabilityIn(BaseModel):
    days: list[int] = Field(min_length=1)  # 0 = Monday ... 6 = Sunday
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    tz: str = "Asia/Kolkata"


class ProfileIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    mode: Literal["practice", "mock"] | None = None
    email_notifications: bool | None = None
    fields: list[FieldRole] | None = None
    availability: AvailabilityIn | None = None


class PracticeIn(BaseModel):
    field: str = "tech"
    role: str
    company: str = "Any company"
    round_type: Literal["screening", "technical", "behavioural", "hr"]
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    count: Literal[1, 2, 3, 5, 10, 15] = 5
    kind: Literal["concept", "coding"] = "concept"  # coding: Tech field, Technical round


class InterviewIn(BaseModel):
    mode: Literal["mock", "perform"]
    field: str = "tech"
    role: str
    company: str = "Any company"  # Mock mode only


class CodeResult(BaseModel):
    """Coding answers run in the candidate's browser with Pyodide; these are the results."""
    code: str = Field("", max_length=20000)
    tests_passed: int = Field(0, ge=0)
    tests_total: int = Field(0, ge=0)
    runs: int = Field(0, ge=0)
    seconds: int = Field(0, ge=0)
    skipped: bool = False


class VoiceMetrics(BaseModel):
    """Measured in the browser while the candidate speaks. Audio is never uploaded."""
    seconds: float = Field(ge=0, le=3600)
    long_pauses: int = Field(0, ge=0, le=500)  # silences longer than 3 seconds
    too_quiet: bool = False


class AnswerIn(BaseModel):
    text: str = Field("", max_length=6000)  # for coding: the explanation of the approach
    code: CodeResult | None = None
    voice: VoiceMetrics | None = None


# ---------- helpers ----------
def me_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "mode": u.mode,
            "email_notifications": u.email_notifications, "availability": flow.availability(u),
            "fields": [{"field": f.field, "role": f.role} for f in u.fields]}


def check_field_role(field: str, role: str) -> dict:
    profiles = questions.all_profiles()
    if field not in profiles:
        raise HTTPException(422, "Unknown field")
    if role not in profiles[field]["roles"]:
        raise HTTPException(422, "Unknown role")
    return profiles[field]


def get_interview(db: Session, iid: int, user: User) -> Interview:
    iv = db.get(Interview, iid)
    if not iv or iv.user_id != user.id:
        raise HTTPException(404, "Interview not found")
    return iv


def open_answer(rnd: Round) -> Answer | None:
    return next((a for a in rnd.answers if a.answer_text is None), None)


def iso(dt):
    return flow.aware(dt).isoformat() if dt else None


def state(iv: Interview) -> dict:
    rnd = flow.active_round(iv)
    cur = open_answer(rnd) if rnd else None
    q = None
    if cur and cur.question_id:
        with SessionLocal() as db:
            q = db.get(Question, cur.question_id)
    return {
        "interview_id": iv.id, "mode": iv.mode, "status": iv.status, "field": iv.field, "role": iv.role,
        "company": iv.company, "expires_at": iso(iv.expires_at),
        "rounds": [{"order": r.order, "round_type": r.round_type, "status": r.status, "score": r.score,
                    "rating": scoring.rating(r.score) if r.score is not None else None, "passed": r.passed,
                    "pass_mark": r.pass_mark, "scheduled_at": iso(r.scheduled_at), "questions": len(r.question_ids),
                    "can_start": flow.can_start(r)[0]} for r in iv.rounds],
        "round_type": rnd.round_type if rnd else None,
        "question_number": min(rnd.current_index + 1, len(rnd.question_ids)) if rnd else None,
        "total": len(rnd.question_ids) if rnd else None,
        "question": cur.question_text if cur else None,
        "is_followup": bool(cur and cur.is_followup),
        "kind": "coding" if (q and q.kind == "coding" and not cur.is_followup) else "concept",
        "coding": {k: q.coding[k] for k in ("function", "starter", "visible")} if (q and q.kind == "coding" and q.coding and not cur.is_followup) else None,
    }


def evaluate(a: Answer, q: Question | None, iv: Interview, rnd: Round, raw: str,
             voice: "VoiceMetrics | None" = None) -> tuple[bool, str | None]:
    """Score one answer. Returns (is_vague, follow_up_question)."""
    prof = questions.field_profile(iv.field)
    weights = prof["rounds"][rnd.round_type]["weights"]
    clean, flags = scoring.remove_injection(raw)
    metrics = scoring.text_metrics(clean)
    if voice and voice.seconds > 0:
        a.modality = "voice"
        metrics.update(voice.model_dump(), wpm=round(metrics["word_count"] / (voice.seconds / 60)))
    kw = (q.keywords if q else []) or []
    args = dict(question=a.question_text, answer=clean or "(no answer)", keywords=kw, round_type=rnd.round_type,
                include_attitude="attitude" in weights)
    res = ai.evaluate_answer(**args, role=iv.role, company=iv.company, example_style=prof["example_answer_style"]) \
        if clean else None
    used_ai = res is not None
    if not res:
        res = scoring.heuristic_eval(**args, example_style=prof["example_answer_style"])
    sub = {k: res[k] for k in weights if k != "tone"}
    sub["tone"] = scoring.tone_score(metrics)
    a.subscores = sub
    a.score = scoring.weighted(sub, weights)
    a.metrics = {**(a.metrics or {}), **metrics}
    a.flags = flags + ([] if used_ai else ["rule_based"])
    a.went_well, a.to_improve = res["went_well"], res["to_improve"]
    a.example_answer = res["example_answer"] or None
    followup = res.get("followup") or ((q.followups or [None])[0] if q else None) \
        or "Could you be more specific? Give one real example: what you did and what the result was."
    return bool(res["vague"]), followup


def evaluate_code(a: Answer, iv: Interview, rnd: Round, body: "AnswerIn") -> None:
    """Coding: tests passed, attempts, time taken and the explanation of the approach."""
    prof = questions.field_profile(iv.field)
    weights = prof["rounds"][rnd.round_type]["weights"]
    c = body.code
    explanation, flags = scoring.remove_injection(body.text)
    m = scoring.text_metrics(explanation)
    ratio = (c.tests_passed / c.tests_total) if c.tests_total and not c.skipped else 0.0
    content = 1 + 9 * ratio - min(1.5, 0.25 * max(0, c.runs - 3)) - (1.0 if c.seconds > 25 * 60 else 0)
    ex = scoring.heuristic_eval(question=a.question_text, answer=explanation or "-", keywords=[], round_type=rnd.round_type,
                                include_attitude=False, example_style="")
    sub = {"content": round(max(1.0, min(10.0, content)), 1),
           "communication": ex["communication"] if m["word_count"] >= 8 else 2.0,
           "thought_process": round(max(1.0, min(10.0, 0.5 * ex["thought_process"] + 5 * ratio)), 1) if m["word_count"] >= 8 else round(1 + 4 * ratio, 1),
           "tone": scoring.tone_score(m) if m["word_count"] >= 8 else 5.0}
    if "attitude" in weights:
        sub["attitude"] = 6.0
    a.subscores = sub
    a.score = scoring.weighted(sub, weights)
    a.modality = "code"
    a.answer_text = (explanation or "(no explanation)") + "\n\n" + (c.code.strip() or "(no code)")
    a.metrics = {**m, "tests_passed": c.tests_passed, "tests_total": c.tests_total, "runs": c.runs, "seconds": c.seconds, "skipped": c.skipped}
    a.flags = flags + (["skipped"] if c.skipped else []) + ["code_run_in_browser"]
    a.went_well = "Skipped." if c.skipped else (f"Passed {c.tests_passed} of {c.tests_total} hidden tests." + (" Clear explanation." if m["word_count"] >= 25 else ""))
    tips = []
    if ratio < 1 and not c.skipped:
        tips.append("Test edge cases (empty input, one item, duplicates) before submitting.")
    if m["word_count"] < 25:
        tips.append("Explain your approach and its time complexity in 2-3 sentences.")
    if c.runs > 5:
        tips.append("Plan the solution before coding to need fewer attempts.")
    a.to_improve = " ".join(tips) or "Mention the time and space complexity and one alternative approach."
    a.example_answer = None


def score_round(iv: Interview, rnd: Round) -> None:
    prof = questions.field_profile(iv.field)
    weights = prof["rounds"][rnd.round_type]["weights"]
    done = [a for a in rnd.answers if a.answer_text is not None]
    rnd.subscores = scoring.average_subscores([a.subscores for a in done], list(weights))
    rnd.score = scoring.weighted(rnd.subscores, weights)
    rnd.improvements = scoring.ranked_improvements(rnd.subscores, [a.metrics or {} for a in done], rnd.round_type)
    rnd.status, rnd.finished_at = "completed", now()
    if rnd.pass_mark is not None:
        rnd.passed = rnd.score >= rnd.pass_mark


def queue(bg: BackgroundTasks, iid: int, events: list[tuple[str, int]]) -> None:
    for kind, order in events:
        bg.add_task(notify.send, iid, kind, order)


def next_question(db: Session, rnd: Round) -> None:
    nq = db.get(Question, rnd.question_ids[rnd.current_index])
    rnd.answers.append(Answer(question_id=nq.id, question_text=nq.text, modality="code" if nq.kind == "coding" else "text"))


# ---------- routes ----------
@app.get("/")
def health():
    return {"ok": True, "ai": ai.enabled(), "email": emailer.enabled()}


@app.get("/catalog")
def catalog():
    profiles = questions.all_profiles()
    return {"fields": [{"key": k, "label": p["label"], "roles": p["roles"], "special_round": p.get("special_round"),
                        "live": True} for k, p in profiles.items()],
            "companies": list(questions.companies()), "rounds": ROUNDS,
            "pass_marks": {rt: c["pass_mark"] for rt, c in profiles["tech"]["rounds"].items()},
            "difficulties": ["easy", "medium", "hard"], "counts": [5, 10, 15],
            "ai_enabled": ai.enabled(), "email_enabled": emailer.enabled()}


@app.post("/auth/signup")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "An account with this email already exists")
    u = User(name=body.name.strip(), email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return {"token": make_token(u.id), "user": me_out(u)}


@app.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if not u or not check_password(body.password, u.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(u.id), "user": me_out(u)}


@app.get("/me")
def me(user: User = Depends(current_user)):
    return me_out(user)


@app.put("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user = db.merge(user)
    if body.name is not None:
        user.name = body.name.strip()
    if body.mode is not None:
        user.mode = body.mode
    if body.email_notifications is not None:
        user.email_notifications = body.email_notifications
    if body.availability is not None:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(body.availability.tz)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(422, "Unknown time zone")
        if any(d not in range(7) for d in body.availability.days) or body.availability.start >= body.availability.end:
            raise HTTPException(422, "Pick at least one day and a start time before the end time")
        user.availability = body.availability.model_dump()
    if body.fields is not None:  # past scores are kept: they live on interviews, not on this list
        for f in body.fields:
            check_field_role(f.field, f.role)
        user.fields = [UserField(field=f.field, role=f.role) for f in {(f.field, f.role): f for f in body.fields}.values()]
    db.commit()
    return me_out(user)


@app.post("/practice")
def start_practice(body: PracticeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    check_field_role(body.field, body.role)
    if body.company not in questions.companies():
        raise HTTPException(422, "Unknown company")
    kind = body.kind
    if kind == "coding" and (body.round_type != "technical" or "coding" not in str(questions.field_profile(body.field).get("special_round"))):
        raise HTTPException(422, "Coding problems are part of the Tech field's Technical round")
    qs, note = questions.pick(db, field=body.field, role=body.role, company=body.company,
                              round_type=body.round_type, difficulty=body.difficulty, n=body.count, kind=kind)
    if not qs:
        raise HTTPException(503, "No questions available for this choice yet")
    iv = Interview(user_id=user.id, mode="practice", field=body.field, role=body.role,
                   company=body.company, difficulty=body.difficulty)
    rnd = Round(round_type=body.round_type, order=1, question_ids=[q.id for q in qs], status="in_progress", started_at=now())
    rnd.answers.append(Answer(question_id=qs[0].id, question_text=qs[0].text, modality="code" if kind == "coding" else "text"))
    iv.rounds.append(rnd)
    db.add(iv)
    db.commit()
    return {**state(iv), "source_note": note}


@app.post("/interviews")
def start_interview(body: InterviewIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Start a Mock-mode interview (one company, ¼ questions, 1 day) or a Perform Mock Interview (4 days)."""
    check_field_role(body.field, body.role)
    if body.mode == "mock" and body.company not in questions.companies():
        raise HTTPException(422, "Unknown company")
    iv = flow.create(db, db.merge(user), mode=body.mode, field=body.field, role=body.role, company=body.company)
    if body.mode == "perform":
        queue(bg, iv.id, [("scheduled", 1)])
    return state(iv)


@app.get("/interviews/{iid}")
def get_state(iid: int, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if flow.expire_if_due(db, iv):
        queue(bg, iv.id, [("expired", 0)])
    return state(iv)


@app.post("/interviews/{iid}/rounds/{order}/start")
def start_round(iid: int, order: int, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if flow.expire_if_due(db, iv):
        queue(bg, iv.id, [("expired", 0)])
        raise HTTPException(409, "This interview has expired")
    flow.start_round(db, iv, order)
    return state(iv)


@app.get("/interviews/{iid}/hidden-tests")
def hidden_tests(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Hidden tests for the open coding problem, fetched only when the candidate presses Submit."""
    iv = get_interview(db, iid, user)
    rnd = flow.active_round(iv)
    a = open_answer(rnd) if rnd else None
    q = db.get(Question, a.question_id) if a and a.question_id else None
    if not q or q.kind != "coding" or a.is_followup:
        raise HTTPException(409, "No coding problem is open")
    return {"function": q.coding["function"], "tests": q.coding["visible"] + q.coding["hidden"]}


@app.post("/interviews/{iid}/answer")
def answer(iid: int, body: AnswerIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if flow.expire_if_due(db, iv):
        queue(bg, iv.id, [("expired", 0)])
        raise HTTPException(409, "This interview has expired")
    rnd = flow.active_round(iv)
    if iv.status != "in_progress" or not rnd:
        raise HTTPException(409, "No round is in progress")
    a = open_answer(rnd)
    q = db.get(Question, a.question_id) if a.question_id else None
    is_code = bool(q and q.kind == "coding" and not a.is_followup)
    if is_code != (body.code is not None):
        raise HTTPException(422, "This question needs a code answer" if is_code else "This question needs a text answer")
    if not is_code and not body.text.strip():
        raise HTTPException(422, "Please type an answer")
    if is_code:
        evaluate_code(a, iv, rnd, body)
        vague, followup = False, None
    else:
        a.answer_text = body.text.strip()
        vague, followup = evaluate(a, q, iv, rnd, a.answer_text, body.voice)
    events = []
    if vague and not a.is_followup and followup:
        rnd.answers.append(Answer(question_id=a.question_id, question_text=followup, is_followup=True))
    else:
        rnd.current_index += 1
        if rnd.current_index < len(rnd.question_ids):
            next_question(db, rnd)
        else:
            score_round(iv, rnd)
            events = flow.after_round(db, db.merge(user), iv, rnd)
    db.commit()
    queue(bg, iv.id, events)
    return {**state(iv), "last_score": a.score, "last_rating": scoring.rating(a.score),
            "round_finished": bool(events), "finished_round": rnd.order if events else None}


@app.post("/interviews/{iid}/finish")
def finish_early(iid: int, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """End a practice session early; answered questions are still scored. Not allowed in Mock or Perform rounds."""
    iv = get_interview(db, iid, user)
    if iv.mode != "practice":
        raise HTTPException(409, "Mock and Perform rounds must be answered in full")
    rnd = iv.rounds[-1]
    if iv.status == "in_progress":
        if a := open_answer(rnd):
            rnd.answers.remove(a)
        if not any(x.answer_text is not None for x in rnd.answers):
            raise HTTPException(409, "Answer at least one question first")
        score_round(iv, rnd)
        events = flow.after_round(db, user, iv, rnd)
        db.commit()
        queue(bg, iv.id, events)
    return state(iv)


@app.get("/interviews/{iid}/report")
def get_report(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return report.build(db, get_interview(db, iid, user))


@app.get("/interviews/{iid}/report.pdf")
def get_pdf(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rep = report.build(db, get_interview(db, iid, user))
    return Response(report.pdf(rep, user.name), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="interview-{iid}.pdf"'})


@app.get("/interviews/{iid}/report.xlsx")
def get_xlsx(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rep = report.build(db, get_interview(db, iid, user))
    return Response(report.xlsx(rep, user.name),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="interview-{iid}.xlsx"'})


@app.get("/progress")
def progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Everything the progress dashboard needs, from completed rounds."""
    rounds = list(db.scalars(select(Round).join(Interview).where(Interview.user_id == user.id, Round.status == "completed")
                             .order_by(Round.finished_at)))
    timeline = [{"date": iso(r.finished_at), "interview_id": r.interview_id, "mode": r.interview.mode, "field": r.interview.field,
                 "round_type": r.round_type, "score": r.score, "passed": r.passed} for r in rounds]
    skills = []
    for key, label in scoring.SUBSCORE_LABELS.items():
        vals = [r.subscores[key] for r in rounds if r.subscores and key in r.subscores]
        if vals:
            k = min(3, len(vals))
            first, recent = round(sum(vals[:k]) / k, 1), round(sum(vals[-k:]) / k, 1)
            skills.append({"key": key, "label": label, "first": first, "recent": recent, "change": round(recent - first, 1), "count": len(vals)})
    by_round = {}
    for rt in ROUNDS:
        s = [r.score for r in rounds if r.round_type == rt]
        if s:
            by_round[rt] = {"count": len(s), "average": round(sum(s) / len(s), 1), "best": max(s), "last": s[-1]}
    ivs = list(db.scalars(select(Interview).where(Interview.user_id == user.id, Interview.mode != "practice")))
    funnel = {m: {"started": sum(1 for i in ivs if i.mode == m),
                  "passed": [sum(1 for i in ivs if i.mode == m and any(r.order == o and r.passed for r in i.rounds)) for o in (1, 2, 3, 4)]}
              for m in ("mock", "perform")}
    return {"timeline": timeline, "skills": skills, "by_round": by_round, "funnel": funnel}


@app.post("/interviews/{iid}/email")
def email_report(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if iv.status == "in_progress":
        raise HTTPException(409, "Finish the interview first")
    if not emailer.enabled():
        raise HTTPException(503, "Email is not set up on this server yet")
    kind = {"practice": "practice"}.get(iv.mode) or {"completed": "final", "failed": "failed", "expired": "expired"}[iv.status]
    order = max((r.order for r in iv.rounds if r.status == "completed"), default=0)
    if not notify.send(iv.id, kind, order):
        raise HTTPException(502, "The email could not be sent. Check that email notifications are on in your profile.")
    return {"sent": True}


@app.get("/interviews")
def history(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ivs = list(db.scalars(select(Interview).where(Interview.user_id == user.id).order_by(Interview.id.desc()).limit(200)))
    for i in ivs:
        flow.expire_if_due(db, i)
    return [{"id": i.id, "mode": i.mode, "field": i.field, "role": i.role, "company": i.company, "status": i.status,
             "round_type": i.rounds[0].round_type if i.mode == "practice" and i.rounds else None, "difficulty": i.difficulty,
             "rounds_passed": sum(1 for r in i.rounds if r.passed), "score": i.overall_score,
             "rating": scoring.rating(i.overall_score) if i.overall_score else None,
             "created_at": iso(i.created_at)} for i in ivs]


@app.post("/tasks/tick")
def tick(x_cron_secret: str = Header(""), db: Session = Depends(get_db)):
    """Called every 30 minutes by .github/workflows/tick.yml: sends reminders and expires old interviews."""
    if not CRON_SECRET or x_cron_secret != CRON_SECRET:
        raise HTTPException(403, "Bad cron secret")
    sent = expired = 0
    for iv in db.scalars(select(Interview).where(Interview.status == "in_progress", Interview.mode != "practice")):
        if flow.expire_if_due(db, iv):
            notify.send(iv.id, "expired", 0)
            expired += 1
            continue
        for r in iv.rounds:
            if r.status == "scheduled" and not r.reminder_sent and r.scheduled_at \
                    and now() <= flow.aware(r.scheduled_at) <= now() + timedelta(minutes=75):
                notify.send(iv.id, "reminder", r.order)
                r.reminder_sent = True
                sent += 1
    db.commit()
    return {"reminders": sent, "expired": expired}
