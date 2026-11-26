"""All settings come from environment variables, so no secret is ever stored in the code."""
import os


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


DATABASE_URL = _env("DATABASE_URL", "sqlite:///./mockinterview.db")
# Neon/Supabase give "postgres://..." URLs; SQLAlchemy wants the psycopg driver name.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

JWT_SECRET = _env("JWT_SECRET", "dev-only-secret-change-me-in-production-0123456789")
JWT_HOURS = int(_env("JWT_HOURS", "72"))

GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")

FRONTEND_ORIGINS = [o.strip() for o in _env("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

# Email: Gmail SMTP (App Password) or Brevo's free HTTP API. Leave blank to switch email off.
SMTP_HOST = _env("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(_env("SMTP_PORT", "587"))
SMTP_USER = _env("SMTP_USER")
SMTP_PASSWORD = _env("SMTP_PASSWORD")
BREVO_API_KEY = _env("BREVO_API_KEY")
MAIL_FROM = _env("MAIL_FROM") or SMTP_USER
