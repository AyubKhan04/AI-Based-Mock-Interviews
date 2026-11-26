"""Question bank: seed questions (original, MIT), AI-generated company-style questions
(labelled "not affiliated"), and openly licensed datasets imported with scripts/import_questions.py.
Sites whose terms forbid scraping (Glassdoor, AmbitionBox, LeetCode) are never used."""
import json
import random
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ai
from .models import Question

DATA = Path(__file__).parent / "data"
FIELDS = Path(__file__).parent / "fields"
AI_LICENSE = "AI-generated (Gemini); company-style, not affiliated"


def field_profile(field: str) -> dict:
    return json.loads((FIELDS / f"{field}.json").read_text())


ROUND_NAME = {"screening": "Screening", "technical": "Technical", "behavioural": "Behavioural", "hr": "HR"}
KIND_LABEL = {"coding": "Coding", "roleplay": "Role-play", "case": "Case", "scenario": "Scenario"}


def round_label(field: str, round_type: str) -> str:
    """The round's name in this field, e.g. Sales calls its Technical round "Sales Skills"."""
    try:
        return field_profile(field).get("round_labels", {}).get(round_type) or ROUND_NAME[round_type]
    except FileNotFoundError:
        return ROUND_NAME.get(round_type, round_type.title())


def special_kind(field: str) -> dict:
    """The field's hands-on question type in the Technical round: coding, role-play, case or scenario."""
    return field_profile(field).get("special_kind") or {"key": "coding", "label": "coding"}


def describe_counts(counts: dict, field: str) -> str:
    """{'roleplay': 4, 'concept': 8} -> '4 role-play + 8 concept'."""
    if set(counts) == {"concept"}:
        return str(counts["concept"])
    label = special_kind(field)["label"]
    return " + ".join(f"{n} {'concept' if k == 'concept' else label}" for k, n in counts.items() if n)


def _shared_texts() -> set[str]:
    """Generic questions that appear in more than one field's bank. Field-specific ones are asked first."""
    seen: dict[str, int] = {}
    for path in DATA.glob("questions_*.json"):
        for t in {q["text"] for q in json.loads(path.read_text())}:
            seen[t] = seen.get(t, 0) + 1
    return {t for t, n in seen.items() if n > 1}


SHARED = _shared_texts()


def companies() -> dict:
    return {k: v for k, v in json.loads((DATA / "companies.json").read_text()).items() if not k.startswith("_")}


def all_profiles() -> dict[str, dict]:
    order = ["tech", "finance", "sales", "hr"]
    paths = sorted(FIELDS.glob("*.json"), key=lambda p: (order.index(p.stem) if p.stem in order else 99, p.stem))
    return {p.stem: json.loads(p.read_text()) for p in paths}


def seed(db: Session) -> None:
    """Add any seed question not yet in the database (safe to run on every start)."""
    have = {(q.field, q.text): q for q in db.scalars(select(Question).where(Question.source == "seed"))}
    added = False
    for path in [*DATA.glob("questions_*.json"), *DATA.glob("coding_*.json")]:
        for q in json.loads(path.read_text()):
            old = have.get((q["field"], q["text"]))
            if old is None:
                db.add(Question(**q))
                added = True
            elif old.kind != q.get("kind", "concept"):  # e.g. a Sales question re-tagged as a role-play
                old.kind = q.get("kind", "concept")
                added = True
    if added:
        db.commit()


def pick(db: Session, *, field: str, role: str, company: str, round_type: str, difficulty: str, n: int,
         kind: str = "concept", common: bool = False) -> tuple[list[Question], str]:
    """Return up to n questions and a note describing where they came from.
    common=True (Perform Mock Interview) uses the questions shared across the most companies."""
    if n <= 0:
        return [], ""
    if not common and kind == "concept" and company != "Any company" and ai.enabled():
        base = select(Question).where(Question.field == field, Question.company == company, Question.role == role,
                                      Question.round_type == round_type, Question.difficulty == difficulty,
                                      Question.kind == "concept")
        cached = list(db.scalars(base))
        # Reuse cached AI questions when there are plenty, to stay well inside the free quota.
        if len(cached) < n * 2:
            new = ai.generate_questions(field=field, role=role, company=company, style=companies().get(company, ""),
                                        round_type=round_type, difficulty=difficulty, n=n)
            for g in new or []:
                q = Question(field=field, role=role, company=company, round_type=round_type, difficulty=difficulty,
                             text=g["text"], keywords=g["keywords"], followups=g["followups"],
                             source="ai-generated", license=AI_LICENSE)
                db.add(q)
                cached.append(q)
            db.commit()
        if len(cached) >= n:
            return random.sample(cached, n), f"{company}-style questions generated by AI. Not affiliated with {company}."

    pool = list(db.scalars(select(Question).where(
        Question.field == field, Question.round_type == round_type, Question.kind == kind,
        Question.role.in_([role, "any"]), Question.company.in_(["any", company]))))
    random.shuffle(pool)
    # Role-specific first, then field-specific, then the most common across companies, then the requested difficulty.
    pool.sort(key=lambda q: (q.role != role, q.text in SHARED, -(q.times_seen_across_companies or 0) if common else 0, q.difficulty != difficulty))
    if common:
        return pool[:n], "Common questions asked across many companies."
    note = "Common questions from the open question bank."
    if company != "Any company":
        note += " Company-style questions need the free Gemini key." if not ai.enabled() else " AI was unavailable, so common questions were used."
    return pool[:n], note
