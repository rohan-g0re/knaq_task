from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..auth import current_user, scoped
from ..db import get_db
from ..models import Alert, AlertEvent, User
from ..schemas import (
    AssignBody, BulkAssignBody, BulkIds, NoteBody, ResolveBody, serialize_alert,
)
from ..transitions import TERMINAL, enforce

router = APIRouter(prefix="/alerts", tags=["alerts"])

# Explicit orderings for the non-chronological sorts (highest urgency first).
SEV_ORDER = case((Alert.severity == "critical", 0), (Alert.severity == "warning", 1), else_=2)
STATUS_ORDER = case(
    (Alert.status == "new", 0), (Alert.status == "acknowledged", 1),
    (Alert.status == "resolved", 2), else_=3,
)
SORTS = {"severity": SEV_ORDER, "status": STATUS_ORDER}


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
    sort: str = "time",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
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

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = SORTS[sort] if sort in SORTS else None
    stmt = stmt.order_by(order, Alert.ts_utc.desc()) if order is not None else stmt.order_by(Alert.ts_utc.desc())
    alerts = db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)).all()

    # Summary-bar counts: whole company set, independent of the active filters/page.
    counts = {"new": 0, "acknowledged": 0, "resolved": 0, "dismissed": 0}
    rows = db.execute(
        scoped(select(Alert.status, func.count()), Alert, user).group_by(Alert.status)
    ).all()
    counts.update({s: n for s, n in rows})

    return {
        "data": [serialize_alert(a) for a in alerts],
        "counts_by_status": counts,
        "page": page, "page_size": page_size, "total": total,
    }


# NOTE: literal-path routes (/stats, /bulk/*) must precede /{alert_id} so "stats"/"bulk"
# aren't parsed as an int id.
@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    alerts = db.scalars(scoped(select(Alert), Alert, user)).all()
    now = datetime.utcnow()
    status_counts = {"new": 0, "acknowledged": 0, "resolved": 0, "dismissed": 0}
    open_by_sev = {"critical": 0, "warning": 0, "info": 0}
    res_by_sev: dict[str, list[int]] = {"critical": [], "warning": [], "info": []}
    volume: dict[str, dict] = defaultdict(lambda: {"critical": 0, "warning": 0, "info": 0})
    logged, resolved, dismissed, this_week, last_week = [], 0, 0, 0, 0

    for a in alerts:
        status_counts[a.status] = status_counts.get(a.status, 0) + 1
        if a.status in ("new", "acknowledged"):
            open_by_sev[a.severity] = open_by_sev.get(a.severity, 0) + 1
        if a.status == "resolved":
            resolved += 1
            if a.resolution_time_spent_minutes is not None:
                logged.append(a.resolution_time_spent_minutes)
                res_by_sev.setdefault(a.severity, []).append(a.resolution_time_spent_minutes)
            if a.resolved_at:
                age = (now - a.resolved_at).days
                this_week += age < 7
                last_week += 7 <= age < 14
        elif a.status == "dismissed":
            dismissed += 1
        volume[a.ts_utc.date().isoformat()][a.severity] += 1

    avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None
    terminal = resolved + dismissed
    return {
        "statusCounts": status_counts,
        "openBySeverity": open_by_sev,
        "mttrMinutes": avg(logged),
        "resolvedThisWeek": this_week,
        "resolvedLastWeek": last_week,
        "dismissalRate": round(dismissed / terminal, 2) if terminal else 0,
        "resolutionBySeverity": {k: avg(v) for k, v in res_by_sev.items()},
        "volumeTrend": [{"date": d, **volume[d]} for d in sorted(volume)],
    }


def _bulk_apply(db, user, ids, mutate):
    """Run `mutate` per id, capturing per-id success/409/404 without aborting the batch."""
    results = []
    for aid in ids:
        alert = db.get(Alert, aid)
        if not alert or alert.company != user.company:
            results.append({"id": aid, "ok": False, "error": "Alert not found."})
            continue
        try:
            mutate(alert)
            results.append({"id": aid, "ok": True, "status": alert.status})
        except HTTPException as e:
            results.append({"id": aid, "ok": False, "error": e.detail})
    db.commit()
    return {"results": results}


@router.post("/bulk/acknowledge")
def bulk_acknowledge(body: BulkIds, db: Session = Depends(get_db), user: User = Depends(current_user)):
    def mutate(a):
        a.status = enforce("acknowledge", a.status)
        a.acknowledged_at = datetime.utcnow()
        _log(a, "acknowledged", user)

    return _bulk_apply(db, user, body.ids, mutate)


@router.post("/bulk/assign")
def bulk_assign(body: BulkAssignBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    assignee = db.get(User, body.assignee_id)
    if not assignee or assignee.company != user.company:
        raise HTTPException(422, "Assignee must be a user in your company.")

    def mutate(a):
        if a.status in TERMINAL:
            raise HTTPException(409, f"Cannot assign an alert in status '{a.status}'.")
        a.assigned_to = assignee.id
        _log(a, "assigned", user, details=f"Assigned to {assignee.name}", note=body.note)

    return _bulk_apply(db, user, body.ids, mutate)


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


# ---- bonus mutations ------------------------------------------------------
@router.post("/{alert_id}/dismiss")
def dismiss(alert_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    alert.status = enforce("dismiss", alert.status)
    _log(alert, "dismissed", user)
    db.commit()
    return serialize_alert(alert, with_timeline=True)


@router.post("/{alert_id}/reopen")
def reopen(alert_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    alert = _get_alert(db, user, alert_id)
    alert.status = enforce("reopen", alert.status)
    # Reopening un-resolves: drop the (now stale) resolution so the record is honest.
    alert.resolved_at = None
    alert.resolution_type = None
    alert.resolution_root_cause = None
    alert.resolution_action_taken = None
    alert.resolution_preventive_measures = None
    alert.resolution_time_spent_minutes = None
    _log(alert, "reopened", user)
    db.commit()
    return serialize_alert(alert, with_timeline=True)
