"""Builds the feedback report (on-screen JSON, PDF and email HTML)."""
from html import escape

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Interview, Round
from .scoring import SUBSCORE_LABELS, rating

PRI_LABEL = {"high": "High: fix first", "medium": "Medium", "low": "Low: polish"}


def _progress(db: Session, rnd: Round, user_id: int) -> list[dict]:
    prev = db.scalars(
        select(Round).join(Interview).where(
            Interview.user_id == user_id, Interview.field == rnd.interview.field, Round.round_type == rnd.round_type,
            Round.status == "completed", Round.id < rnd.id).order_by(Round.id.desc()).limit(1)).first()
    if not prev or not prev.subscores or not rnd.subscores:
        return []
    out = []
    for k, v in rnd.subscores.items():
        if k in prev.subscores:
            before = prev.subscores[k]
            out.append({"area": SUBSCORE_LABELS[k], "before": before, "after": v,
                        "trend": "up" if v > before else "down" if v < before else "same"})
    return out


def build(db: Session, iv: Interview) -> dict:
    rounds = []
    for r in iv.rounds:
        rows = []
        n = 0
        for a in r.answers:
            if a.answer_text is None:
                continue
            if not a.is_followup:
                n += 1
            rows.append({
                "number": f"{n}" if not a.is_followup else f"{n}.f",
                "question": a.question_text, "answer": a.answer_text, "is_followup": a.is_followup,
                "score": a.score, "rating": rating(a.score), "subscores": a.subscores,
                "went_well": a.went_well, "to_improve": a.to_improve, "example_answer": a.example_answer,
                "flags": a.flags or [], "metrics": a.metrics,
            })
        rounds.append({
            "round_type": r.round_type, "status": r.status, "score": r.score, "rating": rating(r.score),
            "subscores": [{"key": k, "label": SUBSCORE_LABELS[k], "score": v, "rating": rating(v)}
                          for k, v in (r.subscores or {}).items()],
            "improvements": r.improvements or [], "progress": _progress(db, r, iv.user_id) if r.status == "completed" else [],
            "pass_mark": r.pass_mark, "passed": r.passed, "questions": rows,
        })
    return {
        "id": iv.id, "mode": iv.mode, "field": iv.field, "role": iv.role, "company": iv.company,
        "difficulty": iv.difficulty, "status": iv.status, "created_at": iv.created_at.isoformat(),
        "overall_score": iv.overall_score, "overall_rating": rating(iv.overall_score), "rounds": rounds,
        "disclaimer": "Practice questions only. Not affiliated with, or endorsed by, any company named.",
    }


def _latin(s) -> str:
    s = "" if s is None else str(s)
    for a, b in {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "→": "->", "…": "..."}.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def _stars(r: dict) -> str:
    return f"{r['stars']}/5 stars ({r['label']})"


def pdf(rep: dict, candidate: str) -> bytes:
    p = FPDF()
    p.set_auto_page_break(True, margin=15)
    p.add_page()
    w = p.epw

    def line(text, size=10, style="", h=5.5):
        p.set_font("Helvetica", style, size)
        p.set_x(p.l_margin)
        p.multi_cell(w, h, _latin(text))

    line("Mock Interview Report", 18, "B", 9)
    line(f"{candidate}  |  {rep['field'].title()} - {rep['role']}  |  {rep['company']}  |  {rep['mode'].title()} mode", 10)
    line(rep["disclaimer"], 8, "I")
    for r in rep["rounds"]:
        p.ln(3)
        line(f"{r['round_type'].title()} round: {r['score']}/10, {_stars(r['rating'])}", 14, "B", 8)
        line(r["rating"]["meaning"], 9, "I")
        for s in r["subscores"]:
            line(f"- {s['label']}: {s['score']}/10")
        if r["progress"]:
            line("Progress since last attempt: " + ", ".join(f"{x['area']} {x['before']} -> {x['after']}" for x in r["progress"]))
        p.ln(2)
        line("Improvements (most important first)", 12, "B", 7)
        for imp in r["improvements"]:
            line(f"[{PRI_LABEL[imp['priority']]}] {imp['area']}: {imp['tip']}")
        p.ln(2)
        line("Question by question", 12, "B", 7)
        for q in r["questions"]:
            p.ln(1)
            line(f"{q['number']}. {q['question']}", 10, "B")
            line(f"What you said: {q['answer']}", 9)
            line(f"Score: {q['score']}/10, {_stars(q['rating'])}", 9, "B")
            if q["flags"]:
                line("Note: a request to change the score was ignored.", 9, "I")
            line(f"What went well: {q['went_well']}", 9)
            line(f"How to improve: {q['to_improve']}", 9)
            if q["example_answer"]:
                line(f"Example answer: {q['example_answer']}", 9, "I")
    return bytes(p.output())


def email_html(rep: dict, name: str) -> str:
    parts = [f"<p>Hi {escape(name)},</p><p>Here is your feedback for <b>{escape(rep['role'])}</b> "
             f"({escape(rep['company'])}-style practice). The full report is attached as a PDF.</p>"]
    for r in rep["rounds"]:
        stars = "&#9733;" * r["rating"]["stars"] + "&#9734;" * (5 - r["rating"]["stars"])
        parts.append(f"<h3>{escape(r['round_type'].title())} round: {r['score']}/10 {stars} {escape(r['rating']['label'])}</h3><ul>")
        parts += [f"<li><b>{escape(i['priority'].title())}</b> &middot; {escape(i['area'])}: {escape(i['tip'])}</li>" for i in r["improvements"]]
        parts.append("</ul>")
    parts.append(f"<p style='color:#777;font-size:12px'>{escape(rep['disclaimer'])}</p>")
    return "".join(parts)
