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


ROADMAP = {
    "Communication": ["Lead with a one-line answer, then 2-3 supporting points.", "Record yourself and cut anything that does not support the main point."],
    "Technical": ["Revise the core concepts for your role and explain each one in 3 sentences with an example.", "For every concept, name one trade-off or limitation."],
    "Problem-solving": ["Think aloud: state the goal, the options you considered, and why you chose one.", "Close with how you would check the result."],
    "Structure": ["Use STAR for every story: Situation, Task, Action, Result.", "End each answer with a measurable result and what you learned."],
    "Delivery": ["Pause instead of saying 'um' or 'basically'.", "Keep answers to 1-2 minutes (about 120-250 words)."],
    "Questions asked": ["Prepare two thoughtful questions about the team, success in the role, or challenges.", "Link your questions to your own goals."],
}


def _avg(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def band(x: float | None) -> float | None:
    """IELTS-style band: nearest 0.5."""
    return None if x is None else round(x * 2) / 2


def final_summary(iv: Interview) -> dict | None:
    done = [r for r in iv.rounds if r.status == "completed" and r.subscores]
    if not done:
        return None
    answers = [a for r in done for a in r.answers if a.subscores]
    sub = lambda k, rs=None: _avg([a.subscores.get(k) for a in answers if rs is None or a.round.round_type in rs])
    skills = {
        "Communication": sub("communication"),
        "Technical": sub("content", {"technical"}),
        "Problem-solving": sub("thought_process"),
        "Structure": _avg([sub("communication", {"behavioural", "hr"}), sub("thought_process", {"behavioural", "hr"})]),
        "Delivery": sub("tone"),
        "Questions asked": sub("attitude", {"hr"}),
    }
    bands = [{"skill": k, "band": band(v), "rating": rating(v)} for k, v in skills.items() if v is not None]
    ranked = sorted(bands, key=lambda b: b["band"], reverse=True)
    weak = [b for b in sorted(bands, key=lambda b: b["band"]) if b["band"] < 9][:3]
    worst_answers = sorted([a for a in answers if a.example_answer], key=lambda a: a.score or 0)
    roadmap = []
    for i, b in enumerate(weak):
        ex = worst_answers[i] if i < len(worst_answers) else None
        roadmap.append({"skill": b["skill"], "from": b["band"], "actions": ROADMAP[b["skill"]],
                        "example": {"question": ex.question_text, "answer": ex.example_answer} if ex else None})
    weakest_rounds = sorted(done, key=lambda r: r.score or 0)[:2]
    plan = [f"Practise the {r.round_type.title()} round in Practice mode ({r.score}/10 last time), on Medium then Hard, "
            f"with two different company styles." for r in weakest_rounds]
    plan.append("Then take a new Mock interview to check your progress.")
    overall = _avg([r.score for r in done])
    return {"complete": iv.status == "completed", "band": band(overall), "rating": rating(overall), "skills": bands,
            "strengths": ranked[:3], "weaknesses": weak or ranked[-3:], "roadmap": roadmap, "practice_plan": plan}


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
            "order": r.order, "round_type": r.round_type, "status": r.status,
            "scheduled_at": r.scheduled_at.isoformat() if r.scheduled_at else None, "score": r.score, "rating": rating(r.score),
            "subscores": [{"key": k, "label": SUBSCORE_LABELS[k], "score": v, "rating": rating(v)}
                          for k, v in (r.subscores or {}).items()],
            "improvements": r.improvements or [], "progress": _progress(db, r, iv.user_id) if r.status == "completed" else [],
            "pass_mark": r.pass_mark, "passed": r.passed, "questions": rows,
        })
    return {
        "id": iv.id, "mode": iv.mode, "field": iv.field, "role": iv.role, "company": iv.company,
        "difficulty": iv.difficulty, "status": iv.status, "created_at": iv.created_at.isoformat(),
        "overall_score": iv.overall_score, "overall_rating": rating(iv.overall_score), "rounds": rounds,
        "expires_at": iv.expires_at.isoformat() if iv.expires_at else None,
        "final": final_summary(iv) if iv.mode != "practice" else None,
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
    f = rep.get("final")
    if f:
        p.ln(3)
        line(("Final report" if f["complete"] else "Report on completed rounds (incomplete)")
             + f": overall band {f['band']}/10, {_stars(f['rating'])}", 14, "B", 8)
        for s in f["skills"]:
            line(f"- {s['skill']}: band {s['band']}")
        line("Top strengths: " + ", ".join(s["skill"] for s in f["strengths"]))
        line("Top weaknesses: " + ", ".join(s["skill"] for s in f["weaknesses"]))
        if f["roadmap"]:
            line("7 -> 10 roadmap", 12, "B", 7)
            for item in f["roadmap"]:
                line(f"{item['skill']} (now {item['from']}): " + " ".join(item["actions"]))
                if item["example"]:
                    line(f"Example. Q: {item['example']['question']}  A: {item['example']['answer']}", 9, "I")
        line("Suggested practice plan", 12, "B", 7)
        for step in f["practice_plan"]:
            line(f"- {step}")
    for r in rep["rounds"]:
        if not r["questions"]:
            continue
        p.ln(3)
        verdict = "" if r["passed"] is None else (" - PASSED" if r["passed"] else f" - not passed (pass mark {r['pass_mark']:g})")
        line(f"{r['round_type'].title()} round: {r['score'] if r['score'] is not None else '-'}/10, {_stars(r['rating'])}{verdict}", 14, "B", 8)
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
             f"({escape(rep['company'])}-style practice). The full report is attached as PDF and Excel.</p>"]
    for r in rep["rounds"]:
        stars = "&#9733;" * r["rating"]["stars"] + "&#9734;" * (5 - r["rating"]["stars"])
        parts.append(f"<h3>{escape(r['round_type'].title())} round: {r['score']}/10 {stars} {escape(r['rating']['label'])}</h3><ul>")
        parts += [f"<li><b>{escape(i['priority'].title())}</b> &middot; {escape(i['area'])}: {escape(i['tip'])}</li>" for i in r["improvements"]]
        parts.append("</ul>")
    parts.append(f"<p style='color:#777;font-size:12px'>{escape(rep['disclaimer'])}</p>")
    return "".join(parts)


def xlsx(rep: dict, candidate: str) -> bytes:
    """Excel version of the report: Summary, Questions and (for Mock/Perform) Final sheets."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="4F46E5")

    def table(ws, headers, rows, widths):
        ws.append(headers)
        for c in ws[ws.max_row]:
            c.font, c.fill = head, fill
        for r in rows:
            ws.append(r)
        for i, w in enumerate(widths):
            ws.column_dimensions[chr(65 + i)].width = w
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "A2"

    ws = wb.active
    ws.title = "Summary"
    ws.append([f"Mock Interview Report: {candidate}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"{rep['field'].title()} · {rep['role']} · {rep['company']} · {rep['mode'].title()} mode · {rep['status']}"])
    ws.append([rep["disclaimer"]])
    ws.append([])
    subs = sorted({s["label"] for r in rep["rounds"] for s in r["subscores"]})
    rows = []
    for r in rep["rounds"]:
        if not r["questions"]:
            continue
        sd = {s["label"]: s["score"] for s in r["subscores"]}
        verdict = "" if r["passed"] is None else ("Passed" if r["passed"] else "Not passed")
        rows.append([r["round_type"].title(), r["score"], f"{r['rating']['stars']}/5 {r['rating']['label']}", verdict, *[sd.get(k) for k in subs]])
    table(ws, ["Round", "Score", "Rating", "Result", *subs], rows, [16, 8, 20, 12] + [16] * len(subs))

    q = wb.create_sheet("Questions")
    qrows = [[r["round_type"].title(), x["number"], x["question"], x["answer"], x["score"],
              f"{x['rating']['stars']}/5", x["went_well"], x["to_improve"], x["example_answer"] or ""]
             for r in rep["rounds"] for x in r["questions"]]
    table(q, ["Round", "#", "Question", "What you said", "Score", "Stars", "What went well", "How to improve", "Example answer"],
          qrows, [13, 5, 40, 50, 7, 7, 30, 35, 50])

    imp = wb.create_sheet("Improvements")
    table(imp, ["Round", "Priority", "Area", "Tip"],
          [[r["round_type"].title(), i["priority"].title(), i["area"], i["tip"]] for r in rep["rounds"] for i in r["improvements"]],
          [13, 10, 24, 80])

    f = rep.get("final")
    if f:
        fs = wb.create_sheet("Final")
        table(fs, ["Skill", "Band"], [[s["skill"], s["band"]] for s in f["skills"]] + [["Overall", f["band"]]], [24, 10])
        fs.append([])
        fs.append(["7 → 10 roadmap"])
        for item in f["roadmap"]:
            fs.append([item["skill"], " ".join(item["actions"])])
        fs.append([])
        fs.append(["Practice plan"])
        for step in f["practice_plan"]:
            fs.append([step])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
