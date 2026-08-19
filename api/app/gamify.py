"""Gamification engine: turn triage timeline events into XP, levels, and badges.

The rules live here as pure, DB-free functions so they can be unit-tested in
isolation and reused by the /leaderboard endpoint. Points are *derived* from the
same `AlertEvent` timeline the audit trail already records — there is no separate
score column to keep in sync, so the leaderboard is always consistent with what
each user actually did.
"""
from __future__ import annotations

from dataclasses import dataclass

# XP awarded per timeline action. `created` is system-generated at ingest (no
# human actor), so it scores nothing.
ACTION_POINTS: dict[str, int] = {
    "acknowledged": 10,
    "assigned": 5,
    "note": 3,
    "dismissed": 8,
    "resolved": 40,
    "reopened": -5,   # undoing a close is a (small) penalty — keeps the board honest
}

# Closing out a higher-severity alert is worth more (skill, not just volume).
SEVERITY_RESOLVE_BONUS: dict[str, int] = {"critical": 25, "warning": 10, "info": 0}

LEVEL_SIZE = 100  # XP needed to advance one level


@dataclass
class PlayerStats:
    """Per-user tallies accumulated while walking the (scoped) event stream."""

    acknowledged: int = 0
    assigned: int = 0
    notes: int = 0
    dismissed: int = 0
    resolved: int = 0
    reopened: int = 0
    critical_resolved: int = 0
    points: int = 0

    def apply(self, action: str, severity: str | None = None) -> None:
        """Fold a single timeline event into the running tally + XP."""
        if action == "acknowledged":
            self.acknowledged += 1
        elif action == "assigned":
            self.assigned += 1
        elif action == "note":
            self.notes += 1
        elif action == "dismissed":
            self.dismissed += 1
        elif action == "resolved":
            self.resolved += 1
            if severity == "critical":
                self.critical_resolved += 1
        elif action == "reopened":
            self.reopened += 1
        self.points += score_action(action, severity)


def score_action(action: str, severity: str | None = None) -> int:
    """XP for one action, including the severity bonus on a resolve."""
    pts = ACTION_POINTS.get(action, 0)
    if action == "resolved" and severity:
        pts += SEVERITY_RESOLVE_BONUS.get(severity, 0)
    return pts


def level_for(points: int) -> dict[str, int]:
    """Map cumulative XP to a level plus progress toward the next one."""
    points = max(points, 0)
    return {
        "level": points // LEVEL_SIZE + 1,
        "xpIntoLevel": points % LEVEL_SIZE,
        "xpForNextLevel": LEVEL_SIZE,
    }


# Achievement catalog. Each `test` is a predicate over a PlayerStats; the
# callable is never serialized — badges_for() emits plain JSON.
BADGE_CATALOG: list[dict] = [
    {"id": "first_responder", "label": "First Responder", "icon": "🚑",
     "description": "Acknowledge your first alert", "test": lambda s: s.acknowledged >= 1},
    {"id": "triage_pro", "label": "Triage Pro", "icon": "⚡",
     "description": "Acknowledge 5 alerts", "test": lambda s: s.acknowledged >= 5},
    {"id": "closer", "label": "Closer", "icon": "✅",
     "description": "Resolve 3 alerts", "test": lambda s: s.resolved >= 3},
    {"id": "firefighter", "label": "Firefighter", "icon": "🔥",
     "description": "Resolve a critical alert", "test": lambda s: s.critical_resolved >= 1},
    {"id": "scribe", "label": "Scribe", "icon": "📝",
     "description": "Leave 3 investigation notes", "test": lambda s: s.notes >= 3},
    {"id": "team_player", "label": "Team Player", "icon": "🤝",
     "description": "Assign 3 alerts to teammates", "test": lambda s: s.assigned >= 3},
    {"id": "century", "label": "Century Club", "icon": "💯",
     "description": "Earn 100 XP", "test": lambda s: s.points >= 100},
    {"id": "legend", "label": "Legend", "icon": "🏆",
     "description": "Earn 250 XP", "test": lambda s: s.points >= 250},
]


def badges_for(stats: PlayerStats) -> list[dict]:
    """The full catalog with an `earned` flag — locked badges are shown too."""
    return [
        {"id": b["id"], "label": b["label"], "icon": b["icon"],
         "description": b["description"], "earned": b["test"](stats)}
        for b in BADGE_CATALOG
    ]
