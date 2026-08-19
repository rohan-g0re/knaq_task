"""Tests for the gamified leaderboard.

  - the scoring rules (pure): severity bonus on resolve, level math, badge gates
  - the endpoint: triage actions earn XP, and the board stays company-scoped
"""
import pytest
from fastapi.testclient import TestClient

from app.gamify import PlayerStats, badges_for, level_for, score_action
from app.main import app

ALICE = {"Authorization": "Bearer brookfield-alice-token"}  # Brookfield Properties
CAROL = {"Authorization": "Bearer hines-carol-token"}        # Hines
RESOLUTION = {"resolution_type": "fixed", "root_cause": "rc", "action_taken": "act"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---- pure scoring rules ---------------------------------------------------
def test_resolve_gets_severity_bonus():
    assert score_action("acknowledged") == 10
    assert score_action("resolved", "info") == 40           # base only
    assert score_action("resolved", "critical") == 40 + 25  # base + critical bonus


def test_level_math():
    assert level_for(0) == {"level": 1, "xpIntoLevel": 0, "xpForNextLevel": 100}
    assert level_for(140)["level"] == 2
    assert level_for(140)["xpIntoLevel"] == 40


def test_badges_unlock_on_threshold():
    stats = PlayerStats()
    stats.apply("acknowledged")                 # 1 ack -> First Responder
    earned = {b["id"] for b in badges_for(stats) if b["earned"]}
    assert "first_responder" in earned
    assert "closer" not in earned               # needs 3 resolves


# ---- endpoint -------------------------------------------------------------
def test_triage_action_earns_xp_and_is_company_scoped(client):
    # Acknowledge a fresh Brookfield alert as Alice -> she earns XP.
    aid = client.get("/alerts", params={"status": "new", "page_size": 1}, headers=ALICE).json()["data"][0]["id"]
    assert client.post(f"/alerts/{aid}/acknowledge", headers=ALICE).status_code == 200

    board = client.get("/leaderboard", headers=ALICE).json()
    alice = next(p for p in board["players"] if p["name"] == "Alice Chen")
    assert alice["points"] >= 10
    assert alice["stats"]["acknowledged"] >= 1
    assert board["meUserId"] == alice["userId"]  # caller is highlighted as "you"

    # Carol (Hines) sees only Hines players — never Alice's Brookfield score.
    hines = client.get("/leaderboard", headers=CAROL).json()
    assert board["summary"]["company"] == "Brookfield Properties"
    assert hines["summary"]["company"] == "Hines"
    assert "Alice Chen" not in {p["name"] for p in hines["players"]}
