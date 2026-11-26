import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["GEMINI_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
Path("test.db").unlink(missing_ok=True)
