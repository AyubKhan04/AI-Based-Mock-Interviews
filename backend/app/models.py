"""Data model.

v1 uses Practice mode only, but the tables already cover the later features:
- Interview.mode: practice | mock | perform
- Round: one row per round, with scheduling and pass/fail columns for Mock and Perform modes
- Question.kind: concept | coding (coding runs in the browser with Pyodide later)
- Answer.modality: text | voice | video, with a metrics JSON for pace, pauses and fillers
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    mode: Mapped[str] = mapped_column(String(20), default="practice")  # practice | mock
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    # Availability for Perform Mock Interview (later): {"days": [...], "start": "18:00", "end": "21:00", "tz": "Asia/Kolkata"}
    availability: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    fields: Mapped[list["UserField"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserField(Base):
    __tablename__ = "user_fields"
    __table_args__ = (UniqueConstraint("user_id", "field", "role"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    field: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(80))
    user: Mapped[User] = relationship(back_populates="fields")


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    field: Mapped[str] = mapped_column(String(40), index=True)
    role: Mapped[str] = mapped_column(String(80), default="any", index=True)
    company: Mapped[str] = mapped_column(String(80), default="any", index=True)
    round_type: Mapped[str] = mapped_column(String(20), index=True)  # screening | technical | behavioural | hr
    difficulty: Mapped[str] = mapped_column(String(10), default="medium")
    kind: Mapped[str] = mapped_column(String(20), default="concept")  # concept | coding
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    followups: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(40))  # seed | ai-generated | dataset | user | partner
    license: Mapped[str] = mapped_column(String(60))
    times_seen_across_companies: Mapped[int] = mapped_column(Integer, default=0)  # for "most common" picks later


class Interview(Base):
    __tablename__ = "interviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    mode: Mapped[str] = mapped_column(String(20), default="practice")  # practice | mock | perform
    field: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(80))
    company: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[str] = mapped_column(String(10), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress | completed | expired | failed
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # Mock mode: 1 day

    rounds: Mapped[list["Round"]] = relationship(back_populates="interview", cascade="all, delete-orphan", order_by="Round.order")


class Round(Base):
    __tablename__ = "rounds"
    id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), index=True)
    round_type: Mapped[str] = mapped_column(String(20))
    order: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # locked | scheduled | in_progress | completed
    question_ids: Mapped[list] = mapped_column(JSON, default=list)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    subscores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    improvements: Mapped[list | None] = mapped_column(JSON, nullable=True)
    pass_mark: Mapped[float | None] = mapped_column(Float, nullable=True)  # None in Practice mode
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    interview: Mapped[Interview] = relationship(back_populates="rounds")
    answers: Mapped[list["Answer"]] = relationship(back_populates="round", cascade="all, delete-orphan", order_by="Answer.id")


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[int] = mapped_column(primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"), index=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id"), nullable=True)
    question_text: Mapped[str] = mapped_column(Text)
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    modality: Mapped[str] = mapped_column(String(10), default="text")  # text | voice | video | code
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # word count, fillers, pace...
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    subscores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    went_well: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_improve: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    flags: Mapped[list | None] = mapped_column(JSON, nullable=True)  # e.g. ["score_request_ignored"]

    round: Mapped[Round] = relationship(back_populates="answers")
