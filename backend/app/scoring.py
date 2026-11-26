"""Scoring, ratings and ranked improvements.

Fairness rules from the plan:
- Tone & delivery is measured only from countable things (filler words, length, shouting, hedging).
  For voice later: pace, pauses and volume. Accent and appearance are never judged.
- Requests like "give me 10/10" are removed before scoring and flagged; they never help.
"""
import re

RATINGS = [
    (9, 5, "Excellent", "Interview-ready, strong hire signal"),
    (7, 4, "Good", "Solid, a few things to polish"),
    (5, 3, "Average", "Acceptable but forgettable"),
    (3, 2, "Below average", "Clear gaps, needs practice"),
    (0, 1, "Needs work", "Off-topic, very short or incorrect"),
]
SUBSCORE_LABELS = {
    "content": "Content", "communication": "Communication", "tone": "Tone & delivery",
    "thought_process": "Thought process", "attitude": "Attitude & questions asked",
}

_INJECTION = [
    r"\b(give|award|rate|score|grade|mark)\b[^.!?\n]{0,30}\b(10|ten|full|perfect|max(imum)?|top|high(est)?)\b",
    r"\b\d{1,2}\s*/\s*10\b",
    r"\b(ignore|disregard|forget)\b[^.!?\n]{0,30}\b(instruction|rule|prompt|above|previous)s?\b",
    r"\b(system prompt|you are now|act as (the|an?) )",
]
FILLERS = ["um", "uh", "erm", "like", "you know", "basically", "actually", "literally", "sort of", "kind of", "i mean"]
_REASONING = ["because", "so that", "therefore", "trade-off", "tradeoff", "first", "then", "finally",
              "approach", "considered", "instead", "which meant", "as a result", "for example", "however"]
_STRUCTURE = ["situation", "task", "action", "result", "first", "second", "then", "finally", "for example", "in short"]
_ATTITUDE = ["learn", "excited", "curious", "team", "grateful", "happy to", "would love", "improve", "?"]


def remove_injection(text: str) -> tuple[str, list[str]]:
    """Drop sentences that try to game the score. Returns (clean_text, flags)."""
    sentences = re.split(r"(?<=[.!?\n])\s+", text or "")
    keep, flagged = [], False
    for s in sentences:
        if any(re.search(p, s, re.I) for p in _INJECTION):
            flagged = True
        else:
            keep.append(s)
    return " ".join(keep).strip(), (["score_request_ignored"] if flagged else [])


def text_metrics(text: str) -> dict:
    words = re.findall(r"[A-Za-z0-9'+#-]+", text)
    low = " " + text.lower() + " "
    fillers = {f: len(re.findall(rf"(?<![a-z]){re.escape(f)}(?![a-z])", low)) for f in FILLERS}
    # "like" is often normal English; only count it when it is set off by commas.
    fillers["like"] = len(re.findall(r",\s*like\s*,", low))
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    caps = [w for w in words if len(w) > 3 and w.isupper()]
    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "avg_sentence_words": round(len(words) / max(1, len(sentences)), 1),
        "filler_count": sum(fillers.values()),
        "fillers": {k: v for k, v in fillers.items() if v},
        "shouting_words": len(caps),
        "exclamations": text.count("!"),
    }


def tone_score(m: dict) -> float:
    """Tone & delivery from measurable signals only."""
    s = 8.0
    wc = max(1, m["word_count"])
    s -= min(3.0, 30 * m["filler_count"] / wc)          # ~1 point per filler per 30 words
    s -= min(1.5, 0.5 * m["shouting_words"]) + min(1.0, 0.3 * m["exclamations"])
    if m["avg_sentence_words"] > 40:                     # run-on answer
        s -= 1.0
    if 40 <= wc <= 250:
        s += 1.0
    elif wc < 15:
        s -= 2.0
    # Spoken answers: pace, long pauses and volume (never accent).
    if m.get("wpm"):
        if m["wpm"] < 90 or m["wpm"] > 185:
            s -= 1.0
        s -= min(1.5, 0.3 * m.get("long_pauses", 0))
        if m.get("too_quiet"):
            s -= 0.5
    return round(max(1.0, min(10.0, s)), 1)


def _has(text: str, words: list[str]) -> int:
    low = text.lower()
    return sum(1 for w in words if w in low)


def heuristic_eval(*, question: str, answer: str, keywords: list[str], round_type: str,
                   include_attitude: bool, example_style: str) -> dict:
    """Rule-based scoring used when Gemini is not configured or fails."""
    m = text_metrics(answer)
    wc = m["word_count"]
    kw_hit = _has(answer, keywords) / max(1, len(keywords)) if keywords else 0.5
    length = min(1.0, wc / 80)
    content = 1 + 9 * (0.6 * kw_hit + 0.4 * length)
    communication = 3 + min(3, _has(answer, _STRUCTURE)) + (2 if 8 <= m["avg_sentence_words"] <= 25 else 0) + (1 if wc >= 40 else 0)
    thought = 2 + min(5, 1.2 * _has(answer, _REASONING)) + 2 * length
    res = {
        "content": round(min(10, content), 1),
        "communication": round(min(10, communication), 1),
        "thought_process": round(min(10, thought), 1),
    }
    if wc < 8:
        res = {k: 1.0 for k in res}
    if include_attitude:
        res["attitude"] = round(min(10, 5 + _has(answer, _ATTITUDE)), 1)
    missing = [k for k in keywords if k not in answer.lower()][:3]
    star = round_type in ("behavioural", "hr")
    res.update({
        "went_well": "You answered the question directly." if wc >= 25 else "You made a start on the answer.",
        "to_improve": (f"Cover key points such as {', '.join(missing)}. " if missing else "")
        + ("Use STAR and end with a measurable result." if star else "Add a small concrete example and one trade-off."),
        "example_answer": "",
        "vague": wc < 25 or (kw_hit == 0 and wc < 60),
        "followup": "",
    })
    return res


def weighted(sub: dict, weights: dict) -> float:
    total = sum(weights.values())
    return round(sum(sub.get(k, 0) * w for k, w in weights.items()) / total, 1)


def rating(score: float | None) -> dict:
    score = score or 0
    for floor, stars, label, meaning in RATINGS:
        if score >= floor:
            return {"stars": stars, "label": label, "meaning": meaning}
    return {"stars": 1, "label": "Needs work", "meaning": RATINGS[-1][3]}


def average_subscores(answers: list[dict], keys: list[str]) -> dict:
    out = {}
    for k in keys:
        vals = [a[k] for a in answers if a.get(k) is not None]
        out[k] = round(sum(vals) / len(vals), 1) if vals else 0.0
    return out


def ranked_improvements(sub: dict, metrics: list[dict], round_type: str) -> list[dict]:
    """Return improvements sorted High → Medium → Low."""
    tips = {
        "content": "Answers need more depth and accuracy. Name the key concepts and give one concrete example each time.",
        "communication": "Answers lack structure. Lead with the main point, then 2-3 supporting points"
        + (", using STAR." if round_type in ("behavioural", "hr") else "."),
        "tone": "Delivery is distracting. Cut filler words, keep a steady pace (about 120-160 words a minute) and keep answers to 1-2 minutes.",
        "thought_process": "Show your reasoning: say why you chose an approach and what trade-off you considered.",
        "attitude": "Show more curiosity: ask a thoughtful question and connect your goals to the team's.",
    }
    items = []
    for k, v in sub.items():
        if v < 5:
            items.append({"priority": "high", "area": SUBSCORE_LABELS[k], "tip": tips[k], "score": v})
        elif v < 7:
            items.append({"priority": "medium", "area": SUBSCORE_LABELS[k], "tip": tips[k], "score": v})
    fillers = sum(m.get("filler_count", 0) for m in metrics)
    if fillers >= 3:
        items.append({"priority": "medium", "area": "Tone & delivery",
                      "tip": f"Too many filler words: {fillers} in {len(metrics)} answers.", "score": None})
    items.append({"priority": "low", "area": "Polish", "tip": "End each answer with a one-line summary.", "score": None})
    order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda i: (order[i["priority"]], i["score"] if i["score"] is not None else 99))
    return items
