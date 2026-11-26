"""All candidate emails. Each one says exactly why the candidate passed or failed."""
from html import escape

from . import emailer, flow, report
from .config import FRONTEND_URL
from .db import SessionLocal
from .models import Interview, User
from .scoring import SUBSCORE_LABELS, rating

ROUND_NAME = {"screening": "Screening", "technical": "Technical", "behavioural": "Behavioural", "hr": "HR"}


def _stars(score) -> str:
    r = rating(score)
    return "&#9733;" * r["stars"] + "&#9734;" * (5 - r["stars"]) + f" {r['label']}"


def _why(rnd) -> str:
    subs = sorted((rnd.subscores or {}).items(), key=lambda kv: kv[1])
    if not subs:
        return ""
    worst, best = subs[0], subs[-1]
    verdict = "passed" if rnd.passed else "did not reach"
    return (f"<p>You scored <b>{rnd.score}/10</b> and the pass mark is <b>{rnd.pass_mark:g}/10</b>, so you {verdict} it. "
            f"Strongest area: {SUBSCORE_LABELS[best[0]]} ({best[1]}). Weakest area: {SUBSCORE_LABELS[worst[0]]} ({worst[1]}).</p>")


def _wrap(name: str, body: str) -> str:
    return (f"<div style='font-family:Arial,sans-serif;max-width:600px'><p>Hi {escape(name)},</p>{body}"
            "<p style='color:#777;font-size:12px'>Mock Interview Coach. Practice only; not affiliated with any company.</p></div>")


def _link(iv: Interview, label: str = "Open your interview") -> str:
    return f"<p><a href='{FRONTEND_URL}/interview/{iv.id}' style='background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none'>{label}</a></p>"


def send(iid: int, kind: str, order: int | None = None) -> bool:
    """kind: practice | passed | failed | final | expired | disqualified | scheduled | reminder"""
    with SessionLocal() as db:
        iv = db.get(Interview, iid)
        user = db.get(User, iv.user_id)
        if not user.email_notifications and kind not in ("scheduled", "reminder"):
            return False
        rnd = next((r for r in iv.rounds if r.order == order), None) if order else None
        title = "Perform Mock Interview" if iv.mode == "perform" else f"{iv.company}-style mock interview"
        rep = report.build(db, iv)
        pdf = None

        if kind == "practice":
            subject = f"Your practice feedback: {rep['overall_rating']['label']} ({iv.overall_score}/10)"
            body, pdf = report.email_html(rep, user.name), True
        elif kind == "passed":
            nxt = next(r for r in iv.rounds if r.order == rnd.order + 1)
            when = (f"<p>Your {ROUND_NAME[nxt.round_type]} round is booked for <b>{flow.fmt_local(user, nxt.scheduled_at)}</b>. "
                    "We'll remind you an hour before.</p>") if iv.mode == "perform" else \
                   (f"<p>The {ROUND_NAME[nxt.round_type]} round is unlocked now. Take a break if you like, but finish all rounds by "
                    f"<b>{flow.fmt_local(user, iv.expires_at)}</b>.</p>")
            subject = f"Selected for the {ROUND_NAME[nxt.round_type]} round ({title})"
            body = (f"<h2>You passed the {ROUND_NAME[rnd.round_type]} round</h2><p>{rnd.score}/10 {_stars(rnd.score)}</p>"
                    + _why(rnd) + when + _link(iv))
        elif kind == "failed":
            hr = rnd.round_type == "hr"
            subject = ("Not selected" if hr else f"{ROUND_NAME[rnd.round_type]} round feedback") + f" ({title})"
            body = (f"<h2>{'Not selected' if hr else 'You cannot proceed to the next round this time'}</h2>"
                    f"<p>{ROUND_NAME[rnd.round_type]} round: {rnd.score}/10 {_stars(rnd.score)}</p>" + _why(rnd)
                    + "<p><b>What to fix first:</b></p><ul>"
                    + "".join(f"<li>{escape(i['area'])}: {escape(i['tip'])}</li>" for i in (rnd.improvements or [])[:3])
                    + "</ul><p>Your full feedback report is attached. Practise this round again in Practice mode, then try a new interview.</p>")
            pdf = True
        elif kind == "final":
            f = rep["final"]
            subject = f"Final report: band {f['band']} ({title})"
            body = (f"<h2>Congratulations, you passed all four rounds</h2><p>Overall band <b>{f['band']}/10</b> {_stars(f['band'])}</p>"
                    "<p><b>Top strengths:</b> " + ", ".join(escape(s['skill']) for s in f["strengths"]) + "</p>"
                    "<p><b>Work on next:</b> " + ", ".join(escape(s['skill']) for s in f["weaknesses"]) + "</p>"
                    "<p>Your full final report with the 7 → 10 roadmap is attached.</p>")
            pdf = True
        elif kind == "expired":
            subject = f"Interview marked incomplete ({title})"
            reason = "the one-day limit passed" if iv.mode == "mock" else "a round was not started within a day of its slot"
            body = (f"<h2>Your interview has ended as incomplete</h2><p>It ended because {reason}. "
                    "Feedback on the rounds you finished is attached. You can start a new one any time.</p>")
            pdf = True
        elif kind == "disqualified":
            subject = f"Interview ended: disqualified ({title})"
            body = (f"<h2>Your interview has ended</h2><p>{escape(iv.disqualified_reason or 'Disqualified.')}</p>"
                    "<p>Mock and Perform rounds need the interview tab in fullscreen and the camera on the whole time, "
                    "with 3 chances for each. Feedback on any rounds you finished is attached. You can start a new interview any time.</p>")
            pdf = True
        elif kind == "scheduled":
            subject = f"Your Perform Mock Interview: {ROUND_NAME[rnd.round_type]} round booked"
            body = (f"<h2>Round {rnd.order}: {ROUND_NAME[rnd.round_type]}</h2><p>Date and time: <b>{flow.fmt_local(user, rnd.scheduled_at)}</b></p>"
                    "<p>The round opens 15 minutes before. Find a quiet place.</p>" + _link(iv, "Join your round"))
        elif kind == "reminder":
            subject = f"Reminder: {ROUND_NAME[rnd.round_type]} round in 1 hour"
            body = (f"<p>Your {ROUND_NAME[rnd.round_type]} round starts at <b>{flow.fmt_local(user, rnd.scheduled_at)}</b>.</p>"
                    + _link(iv, "Join your round"))
        else:
            raise ValueError(kind)
        attachment = [(f"interview-{iv.id}.pdf", report.pdf(rep, user.name)),
                      (f"interview-{iv.id}.xlsx", report.xlsx(rep, user.name))] if pdf else None
        return emailer.send(user.email, subject, _wrap(user.name, body) if kind != "practice" else body, attachment)
