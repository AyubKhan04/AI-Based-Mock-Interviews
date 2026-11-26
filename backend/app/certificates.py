"""Practice certificates (public, verifiable by link) and practice offer or rejection letters.
Both are clearly marked as practice simulations and never use a real company's name."""
import hashlib
import hmac
from datetime import datetime

from fpdf import FPDF

from .config import FRONTEND_URL, JWT_SECRET
from .models import Interview, User

ISSUER = "Mock Interview Coach"
DISCLAIMER = "Practice simulation. Not a real job offer or qualification, and not affiliated with any company."


def certificate_code(iid: int) -> str:
    sig = hmac.new(JWT_SECRET.encode(), f"cert:{iid}".encode(), hashlib.sha256).hexdigest()[:10]
    return f"{iid}-{sig}"


def parse_code(code: str) -> int | None:
    try:
        iid = int(code.split("-", 1)[0])
    except ValueError:
        return None
    return iid if hmac.compare_digest(certificate_code(iid), code) else None


def eligible(iv: Interview) -> bool:
    return iv.mode in ("mock", "perform") and iv.status == "completed"


def details(iv: Interview, user: User, field_label: str) -> dict:
    code = certificate_code(iv.id)
    done = max((r.finished_at for r in iv.rounds if r.finished_at), default=iv.created_at)
    return {"valid": True, "code": code, "name": user.name, "role": iv.role, "field": field_label,
            "mode": "Perform Mock Interview (4 rounds over 4 days)" if iv.mode == "perform" else "Mock Interview (4 rounds)",
            "score": iv.overall_score, "rounds": [{"round_type": r.round_type, "score": r.score} for r in iv.rounds],
            "date": done.date().isoformat(), "verify_url": f"{FRONTEND_URL}/certificate/{code}", "issuer": ISSUER, "disclaimer": DISCLAIMER}


def _txt(s: str) -> str:
    return s.encode("latin-1", "replace").decode("latin-1")


def pdf(d: dict) -> bytes:
    p = FPDF(orientation="L", format="A4")
    p.set_auto_page_break(False)
    p.add_page()
    p.set_draw_color(79, 70, 229)
    p.set_line_width(2.5)
    p.rect(8, 8, 281, 194)
    p.set_line_width(0.6)
    p.rect(13, 13, 271, 184)
    p.set_text_color(79, 70, 229)
    p.set_font("Helvetica", "B", 13)
    p.set_y(28)
    p.cell(0, 8, ISSUER.upper(), align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_text_color(30, 41, 59)
    p.set_font("Helvetica", "B", 34)
    p.cell(0, 18, "Certificate of Completion", align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_font("Helvetica", "", 13)
    p.cell(0, 10, "This certifies that", align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_font("Helvetica", "B", 28)
    p.cell(0, 16, _txt(d["name"]), align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_font("Helvetica", "", 13)
    p.multi_cell(0, 8, _txt(f"passed all four rounds of a {d['mode']}\nfor the role of {d['role']} ({d['field']})"), align="C",
                 new_x="LMARGIN", new_y="NEXT")
    p.ln(2)
    p.set_font("Helvetica", "B", 16)
    p.set_text_color(79, 70, 229)
    p.cell(0, 10, f"Overall score: {d['score']}/10", align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_text_color(71, 85, 105)
    p.set_font("Helvetica", "", 10)
    p.ln(6)
    p.cell(0, 6, _txt(f"Issued {datetime.fromisoformat(d['date']).strftime('%d %B %Y')}  |  Certificate ID {d['code']}"), align="C",
           new_x="LMARGIN", new_y="NEXT")
    p.cell(0, 6, _txt(f"Verify at {d['verify_url']}"), align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_y(182)
    p.set_font("Helvetica", "I", 9)
    p.cell(0, 6, DISCLAIMER, align="C")
    return bytes(p.output())


def letter(iv: Interview, user: User, field_label: str) -> dict:
    """A realistic practice offer or polite rejection, clearly labelled as a simulation."""
    offer = iv.status == "completed"
    last = next((r for r in reversed(iv.rounds) if r.score is not None), None)
    first = user.name.split(" ")[0] if not user.is_guest else "Candidate"
    if offer:
        paras = [
            f"Thank you for taking the time to interview with us for the {iv.role} position. The panel enjoyed meeting you across all four rounds.",
            f"We are pleased to let you know that you have been selected for the role of {iv.role}. You finished with an overall score of {iv.overall_score}/10, "
            "and the panel was especially impressed by the way you handled the later rounds.",
            "In a real process, this is where you would receive your compensation details, joining date and the documents to sign. "
            "Take this as your sign that you are interview-ready: apply with confidence.",
            "Congratulations, and welcome aboard (in practice)!",
        ]
    else:
        stage = f"the {last.round_type.title() if last and last.round_type != 'hr' else 'HR'} round" if last else "this stage"
        reason = iv.disqualified_reason
        paras = [
            f"Thank you for your interest in the {iv.role} position and for the time you spent with our panel.",
            ("After careful consideration, we will not be moving forward with your application at this time. " if not reason else
             "Unfortunately this interview ended early under the interview rules, so we cannot move forward with your application this time. ")
            + (f"The decision was made after {stage}." if not reason else reason),
            "This is not the end of the road. Your feedback report lists exactly what to work on first, and candidates who practise "
            "those points usually improve quickly. We encourage you to try again.",
            "We wish you the very best in your job search.",
        ]
    return {"kind": "offer" if offer else "rejection", "to": first, "role": iv.role, "field": field_label,
            "subject": f"{'Offer of employment' if offer else 'Your application'}: {iv.role}",
            "date": max((r.finished_at for r in iv.rounds if r.finished_at), default=iv.created_at).date().isoformat(),
            "paragraphs": paras, "signoff": "The Hiring Panel", "issuer": ISSUER, "disclaimer": DISCLAIMER,
            "certificate": certificate_code(iv.id) if offer else None}
