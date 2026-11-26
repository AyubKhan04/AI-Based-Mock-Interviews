import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, emailer, questions, report, scoring
from .config import FRONTEND_ORIGINS
from .db import Base, SessionLocal, engine, get_db
from .models import Answer, Interview, Question, Round, User, UserField
from .security import check_password, current_user, hash_password, make_token

logging.basicConfig(level=logging.INFO)
ROUNDS = ["screening", "technical", "behavioural", "hr"]
LIVE_FIELDS = ["tech"]  # Finance, Sales and HR profiles come later


@asynccontextmanager
async def lifespan(_):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        questions.seed(db)
    yield


app = FastAPI(title="AI Mock Interview Coach", version="0.1.0", lifespan=lifespan)
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
    field: Literal["tech"]
    role: str


class ProfileIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    mode: Literal["practice", "mock"] | None = None
    email_notifications: bool | None = None
    fields: list[FieldRole] | None = None


class PracticeIn(BaseModel):
    field: Literal["tech"] = "tech"
    role: str
    company: str = "Any company"
    round_type: Literal["screening", "technical", "behavioural", "hr"]
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    count: Literal[5, 10, 15] = 5


class AnswerIn(BaseModel):
    text: str = Field(max_length=6000)


# ---------- helpers ----------
def me_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "mode": u.mode,
            "email_notifications": u.email_notifications,
            "fields": [{"field": f.field, "role": f.role} for f in u.fields]}


def get_interview(db: Session, iid: int, user: User) -> Interview:
    iv = db.get(Interview, iid)
    if not iv or iv.user_id != user.id:
        raise HTTPException(404, "Interview not found")
    return iv


def open_answer(rnd: Round) -> Answer | None:
    return next((a for a in rnd.answers if a.answer_text is None), None)


def state(iv: Interview) -> dict:
    rnd = iv.rounds[-1]
    cur = open_answer(rnd)
    return {"interview_id": iv.id, "status": iv.status, "round_type": rnd.round_type,
            "question_number": min(rnd.current_index + 1, len(rnd.question_ids)), "total": len(rnd.question_ids),
            "question": cur.question_text if cur else None, "is_followup": bool(cur and cur.is_followup)}


def evaluate(a: Answer, q: Question | None, iv: Interview, rnd: Round, raw: str) -> tuple[bool, str | None]:
    """Score one answer. Returns (is_vague, follow_up_question)."""
    prof = questions.field_profile(iv.field)
    weights = prof["rounds"][rnd.round_type]["weights"]
    clean, flags = scoring.remove_injection(raw)
    metrics = scoring.text_metrics(clean)
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
    a.metrics = metrics
    a.flags = flags + ([] if used_ai else ["rule_based"])
    a.went_well, a.to_improve = res["went_well"], res["to_improve"]
    a.example_answer = res["example_answer"] or None
    followup = res.get("followup") or ((q.followups or [None])[0] if q else None) \
        or "Could you be more specific? Give one real example: what you did and what the result was."
    return bool(res["vague"]), followup


def finish_round(db: Session, iv: Interview, rnd: Round) -> None:
    prof = questions.field_profile(iv.field)
    weights = prof["rounds"][rnd.round_type]["weights"]
    done = [a for a in rnd.answers if a.answer_text is not None]
    rnd.subscores = scoring.average_subscores([a.subscores for a in done], list(weights))
    rnd.score = scoring.weighted(rnd.subscores, weights)
    rnd.improvements = scoring.ranked_improvements(rnd.subscores, [a.metrics or {} for a in done], rnd.round_type)
    rnd.status, rnd.finished_at = "completed", datetime.now(timezone.utc)
    if rnd.pass_mark is not None:  # Mock / Perform modes
        rnd.passed = rnd.score >= rnd.pass_mark
    iv.overall_score = rnd.score if iv.mode == "practice" else iv.overall_score
    iv.status = "completed"


def send_report(iid: int) -> None:
    with SessionLocal() as db:
        iv = db.get(Interview, iid)
        user = db.get(User, iv.user_id)
        rep = report.build(db, iv)
        emailer.send(user.email, f"Your mock interview feedback: {rep['overall_rating']['label']} ({iv.overall_score}/10)",
                     report.email_html(rep, user.name), (f"interview-{iid}.pdf", report.pdf(rep, user.name)))


# ---------- routes ----------
@app.get("/")
def health():
    return {"ok": True, "ai": ai.enabled(), "email": emailer.enabled()}


@app.get("/catalog")
def catalog():
    prof = questions.field_profile("tech")
    return {"fields": [{"key": "tech", "label": "Tech", "roles": prof["roles"], "live": True},
                       *[{"key": k, "label": k.title(), "roles": [], "live": False} for k in ("finance", "sales", "hr")]],
            "companies": list(questions.companies()), "rounds": ROUNDS,
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
    if body.fields is not None:  # past scores are kept: they live on interviews, not on this list
        roles = questions.field_profile("tech")["roles"]
        if any(f.role not in roles for f in body.fields):
            raise HTTPException(422, "Unknown role")
        user.fields = [UserField(field=f.field, role=f.role) for f in {(f.field, f.role): f for f in body.fields}.values()]
    db.commit()
    return me_out(user)


@app.post("/practice")
def start_practice(body: PracticeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.role not in questions.field_profile(body.field)["roles"]:
        raise HTTPException(422, "Unknown role")
    if body.company not in questions.companies():
        raise HTTPException(422, "Unknown company")
    qs, note = questions.pick(db, field=body.field, role=body.role, company=body.company,
                              round_type=body.round_type, difficulty=body.difficulty, n=body.count)
    if not qs:
        raise HTTPException(503, "No questions available for this choice yet")
    iv = Interview(user_id=user.id, mode="practice", field=body.field, role=body.role,
                   company=body.company, difficulty=body.difficulty)
    rnd = Round(round_type=body.round_type, order=1, question_ids=[q.id for q in qs])
    rnd.answers.append(Answer(question_id=qs[0].id, question_text=qs[0].text))
    iv.rounds.append(rnd)
    db.add(iv)
    db.commit()
    return {**state(iv), "source_note": note}


@app.get("/interviews/{iid}")
def get_state(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return state(get_interview(db, iid, user))


@app.post("/interviews/{iid}/answer")
def answer(iid: int, body: AnswerIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if iv.status != "in_progress":
        raise HTTPException(409, "This interview is already finished")
    rnd = iv.rounds[-1]
    a = open_answer(rnd)
    a.answer_text = body.text.strip()
    q = db.get(Question, a.question_id) if a.question_id else None
    vague, followup = evaluate(a, q, iv, rnd, a.answer_text)
    if vague and not a.is_followup and followup:
        rnd.answers.append(Answer(question_id=a.question_id, question_text=followup, is_followup=True))
    else:
        rnd.current_index += 1
        if rnd.current_index < len(rnd.question_ids):
            nq = db.get(Question, rnd.question_ids[rnd.current_index])
            rnd.answers.append(Answer(question_id=nq.id, question_text=nq.text))
        else:
            finish_round(db, iv, rnd)
    db.commit()
    if iv.status == "completed" and user.email_notifications:
        bg.add_task(send_report, iv.id)
    return {**state(iv), "last_score": a.score, "last_rating": scoring.rating(a.score)}


@app.post("/interviews/{iid}/finish")
def finish_early(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """End a practice session early; answered questions are still scored."""
    iv = get_interview(db, iid, user)
    rnd = iv.rounds[-1]
    if iv.status == "in_progress":
        if a := open_answer(rnd):
            rnd.answers.remove(a)
        if not any(x.answer_text is not None for x in rnd.answers):
            raise HTTPException(409, "Answer at least one question first")
        finish_round(db, iv, rnd)
        db.commit()
    return state(iv)


@app.get("/interviews/{iid}/report")
def get_report(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return report.build(db, get_interview(db, iid, user))


@app.get("/interviews/{iid}/report.pdf")
def get_pdf(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rep = report.build(db, get_interview(db, iid, user))
    return Response(report.pdf(rep, user.name), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="interview-{iid}.pdf"'})


@app.post("/interviews/{iid}/email")
def email_report(iid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    iv = get_interview(db, iid, user)
    if iv.status != "completed":
        raise HTTPException(409, "Finish the interview first")
    if not emailer.enabled():
        raise HTTPException(503, "Email is not set up on this server yet")
    send_report(iv.id)
    return {"sent": True}


@app.get("/interviews")
def history(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ivs = db.scalars(select(Interview).where(Interview.user_id == user.id).order_by(Interview.id.desc()).limit(100))
    return [{"id": i.id, "mode": i.mode, "role": i.role, "company": i.company, "status": i.status,
             "round_type": i.rounds[0].round_type if i.rounds else None, "difficulty": i.difficulty,
             "score": i.overall_score, "rating": scoring.rating(i.overall_score) if i.overall_score else None,
             "created_at": i.created_at.isoformat()} for i in ivs]
