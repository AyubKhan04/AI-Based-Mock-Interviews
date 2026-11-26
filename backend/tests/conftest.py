import os
import sys
from pathlib import Path

# Set TEST_DATABASE_URL to a Postgres URL to run the tests against Postgres.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///./test.db")
os.environ["GEMINI_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
Path("test.db").unlink(missing_ok=True)
