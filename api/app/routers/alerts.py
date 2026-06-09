from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, scoped
from ..db import get_db
from ..models import Alert, AlertEvent, User
from ..schemas import AssignBody, NoteBody, ResolveBody, serialize_alert
from ..transitions import TERMINAL, enforce

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _get_alert(db, user, alert_id) -> Alert:
    alert = db.get(Alert, alert_id)
    if not alert or alert.company != user.company:   # 404 cross-company: don't reveal existence
        raise HTTPException(404, "Alert not found.")
    return alert


def _log(alert, action, user, details=None, note=None):
    # Append to the relationship so the in-memory alert reflects the new event without a re-query.
    alert.events.append(
        AlertEvent(ts=datetime.utcnow(), action=action, user_name=user.name, details=details, note=note)
    )


@router.get("")
def list_alerts(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    severity: list[str] | None = Query(None),
    status: list[str] | None = Query(None),
    device_id: str | None = None,
    assigned_to: int | None = None,
    q: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
):
    stmt = scoped(select(Alert), Alert, user)
    if severity:
        stmt = stmt.where(Alert.severity.in_(severity))
    if status:
        stmt = stmt.where(Alert.status.in_(status))
    if device_id:
        stmt = stmt.where(Alert.device_id == device_id)
    if assigned_to is not None:
        stmt = stmt.where(Alert.assigned_to == assigned_to)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Alert.title.ilike(like) | Alert.device_id.ilike(like))
    if from_:
        stmt = stmt.where(Alert.ts_utc >= _parse_dt(from_))
    if to:
        stmt = stmt.where(Alert.ts_utc <= _parse_dt(to))

    alerts = db.scalars(stmt.order_by(Alert.ts_utc.desc())).all()

    # Summary-bar counts: whole company set, independent of the active filters.
    counts = {"new": 0, "acknowledged": 0, "resolved": 0, "dismissed": 0}
    rows = db.execute(
        scoped(select(Alert.status, func.count()), Alert, user).group_by(Alert.status)
    ).all()
    counts.update({s: n for s, n in rows})

    return {"data": [serialize_alert(a) for a in alerts], "counts_by_status": counts}


@router.get("/{alert_id}")
def get_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return serialize_alert(_get_alert(db, user, alert_id), with_timeline=True)


@router.post("/{alert_id}/acknowledge")
def acknowledge(alert_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    alert.status = enforce("acknowledge", alert.status)
    alert.acknowledged_at = datetime.utcnow()
    _log(alert, "acknowledged", user)
    db.commit()
    return serialize_alert(alert, with_timeline=True)


@router.post("/{alert_id}/assign")
def assign(alert_id: int, body: AssignBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    if alert.status in TERMINAL:
        raise HTTPException(409, f"Cannot assign an alert in status '{alert.status}'.")
    assignee = db.get(User, body.assignee_id)
    if not assignee or assignee.company != user.company:
        raise HTTPException(422, "Assignee must be a user in your company.")
    alert.assigned_to = assignee.id
    _log(alert, "assigned", user, details=f"Assigned to {assignee.name}", note=body.note)
    db.commit()
    return serialize_alert(alert, with_timeline=True)


@router.post("/{alert_id}/resolve")
def resolve(alert_id: int, body: ResolveBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    alert.status = enforce("resolve", alert.status)
    alert.resolved_at = datetime.utcnow()
    alert.resolution_type = body.resolution_type
    alert.resolution_root_cause = body.root_cause
    alert.resolution_action_taken = body.action_taken
    alert.resolution_preventive_measures = body.preventive_measures
    alert.resolution_time_spent_minutes = body.time_spent_minutes
    _log(alert, "resolved", user, details=f"Resolution: {body.resolution_type}")
    db.commit()
    return serialize_alert(alert, with_timeline=True)


@router.post("/{alert_id}/notes")
def add_note(alert_id: int, body: NoteBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    _log(alert, "note", user, note=body.note)
    db.commit()
    return serialize_alert(alert, with_timeline=True)
