import os
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent          # .../api
REPO_DIR = API_DIR.parent                                 # repo root

DATA_DIR = Path(os.getenv("DATA_DIR") or REPO_DIR / "data")
DB_URL = os.getenv("DB_URL", "sqlite:///./knaq.db")
WEB_ORIGIN = os.getenv("WEB_ORIGIN", "http://localhost:3000")
