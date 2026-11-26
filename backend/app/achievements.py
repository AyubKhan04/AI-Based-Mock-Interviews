"""Daily practice streaks and badges, worked out from the user's own answers (nothing extra is stored)."""
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import flow
from .models import Answer, Interview, Round, User, now

BADGES = [
    ("first_answer", "🎤", "First answer", "Answer your first interview question."),
    ("streak_3", "🔥", "3-day streak", "Practise on 3 days in a row."),
    ("streak_7", "🏆", "7-day streak", "Practise on 7 days in a row."),
    ("ten_sessions", "📚", "10 sessions", "Finish 10 practice sessions or rounds."),
    ("star_storyteller", "⭐", "STAR storyteller", "Score 8+ on an answer with all four STAR parts."),
    ("voice_ready", "🗣", "Voice ready", "Give 5 spoken answers."),
    ("clean_coder", "💻", "Clean coder", "Pass every hidden test on a coding problem."),
    ("round_cleared", "✅", "Round cleared", "Pass a round in Mock mode or Perform."),
    ("all_four", "🎯", "Selected", "Pass all four rounds of a Mock or Perform interview."),
    ("explorer", "🧭", "Explorer", "Practise in two different fields."),
]


def _days(user: User, answers: list[tuple[Answer, Round]]) -> set[date]:
    tz = ZoneInfo(flow.availability(user)["tz"])
    out = set()
    for a, r in answers:
        when = a.answered_at or r.finished_at or r.started_at
        if when:
            out.add(flow.aware(when).astimezone(tz).date())
    return out


def streaks(days: set[date], today: date) -> dict:
    cur, d = 0, today if today in days else today - timedelta(days=1)  # today not done yet keeps yesterday's streak
    while d in days:
        cur, d = cur + 1, d - timedelta(days=1)
    best = run = 0
    prev = None
    for d in sorted(days):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        best, prev = max(best, run), d
    return {"current": cur, "best": best, "today_done": today in days}


def summary(db: Session, user: User) -> dict:
    rows = list(db.execute(select(Answer, Round).join(Round, Answer.round_id == Round.id).join(Interview)
                           .where(Interview.user_id == user.id, Answer.answer_text.is_not(None))))
    tz = ZoneInfo(flow.availability(user)["tz"])
    st = streaks(_days(user, rows), now().astimezone(tz).date())
    ivs = list(db.scalars(select(Interview).where(Interview.user_id == user.id)))
    finished = sum(1 for i in ivs for r in i.rounds if r.status == "completed")
    answers = [a for a, _ in rows]
    earned = {
        "first_answer": bool(answers),
        "streak_3": st["best"] >= 3,
        "streak_7": st["best"] >= 7,
        "ten_sessions": finished >= 10,
        "star_storyteller": any((a.score or 0) >= 8 and a.coaching and a.coaching.get("star") and all(a.coaching["star"].values())
                                for a in answers),
        "voice_ready": sum(1 for a in answers if a.modality == "voice") >= 5,
        "clean_coder": any(a.modality == "code" and (a.metrics or {}).get("tests_total") and
                           a.metrics.get("tests_passed") == a.metrics.get("tests_total") for a in answers),
        "round_cleared": any(r.passed for i in ivs if i.mode != "practice" for r in i.rounds),
        "all_four": any(i.status == "completed" and i.mode != "practice" for i in ivs),
        "explorer": len({i.field for i in ivs if i.rounds and any(r.status == "completed" for r in i.rounds)}) >= 2,
    }
    return {"streak": st, "badges": [{"key": k, "icon": ic, "label": lb, "how": how, "earned": earned[k]} for k, ic, lb, how in BADGES]}
