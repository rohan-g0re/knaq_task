"""Test bootstrap. Runs before any `app.*` import.

Two things must happen first: make the `app` package importable, and point the
app at a throwaway SQLite file — `app.db` reads DB_URL at import time, so the env
var has to be set before the app module graph loads.
"""
import os
import pathlib
import sys
import tempfile

API_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(API_DIR))

_db = pathlib.Path(tempfile.mkdtemp(prefix="knaq-test-")) / "test_knaq.db"
os.environ["DB_URL"] = f"sqlite:///{_db.as_posix()}"
