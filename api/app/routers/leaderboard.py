"""The gamified /leaderboard endpoint ("Arena").

Ranks the requesting user's company teammates by XP earned from their triage
activity. Everything is derived live from the alert timeline and scoped to the
caller's company, so a Hines user never sees a Brookfield score.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..gamify import PlayerStats, badges_for, level_for
from ..models import Alert, AlertEvent, User

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    # Everyone in the company is a "player" (even at 0 XP) so the roster is stable.
    users = db.scalars(
        select(User).where(User.company == user.company).order_by(User.name)
    ).all()
    stats: dict[str, PlayerStats] = {u.name: PlayerStats() for u in users}

    # One pass over the company's timeline events, joined to their alert for severity.
    rows = db.execute(
        select(AlertEvent.action, AlertEvent.user_name, Alert.severity)
        .join(Alert, AlertEvent.alert_id == Alert.id)
        .where(Alert.company == user.company)
    ).all()
    for action, name, severity in rows:
        player = stats.get(name)
        if player is not None:                 # ignore system `created` events (no actor)
            player.apply(action, severity)

    players = []
    for u in users:
        s = stats[u.name]
        players.append({
            "userId": u.id,
            "name": u.name,
            "role": u.role,
            "points": max(s.points, 0),
            **level_for(s.points),
            "stats": {
                "acknowledged": s.acknowledged,
                "assigned": s.assigned,
                "notes": s.notes,
                "dismissed": s.dismissed,
                "resolved": s.resolved,
            },
            "badges": badges_for(s),
        })

    # Highest XP first; break ties by resolves, then name for stability.
    players.sort(key=lambda p: (-p["points"], -p["stats"]["resolved"], p["name"]))
    for i, p in enumerate(players):
        p["rank"] = i + 1

    summary = {
        "company": user.company,
        "totalPoints": sum(p["points"] for p in players),
        "totalResolved": sum(p["stats"]["resolved"] for p in players),
        "activePlayers": sum(1 for p in players if p["points"] > 0),
    }
    return {"players": players, "summary": summary, "meUserId": user.id}
