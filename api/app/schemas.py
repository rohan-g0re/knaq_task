from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import tz
from .models import Alert, AlertEvent, Device, Reading, User

ResolutionType = Literal["fixed", "false_alarm", "known_issue", "deferred", "cannot_reproduce"]


# ---- request bodies -------------------------------------------------------
class AssignBody(BaseModel):
    assignee_id: int
    note: Optional[str] = None


class ResolveBody(BaseModel):
    resolution_type: ResolutionType
    root_cause: str = Field(min_length=1)
    action_taken: str = Field(min_length=1)
    preventive_measures: Optional[str] = None
    time_spent_minutes: Optional[int] = Field(default=None, ge=0)


class NoteBody(BaseModel):
    note: str = Field(min_length=1)


# ---- serializers (DB row -> camelCase JSON for the frontend contract) -----
def user_brief(u: Optional[User]):
    return {"id": u.id, "name": u.name, "role": u.role} if u else None


def serialize_event(e: AlertEvent):
    return {
        "timestamp": tz.utc_iso(e.ts),
        "action": e.action,
        "user": e.user_name,
        "details": e.details,
        "note": e.note,
    }


def serialize_alert(a: Alert, with_timeline: bool = False):
    out = {
        "id": a.id,
        "deviceId": a.device_id,
        "deviceName": a.device.name,
        "location": a.device.location,
        "deviceTimezone": a.device.timezone,
        "company": a.company,
        "alertType": a.alert_type,
        "severity": a.severity,
        "title": a.title,
        "threshold": a.threshold,
        "readingValue": a.reading_value,
        "readingName": a.reading_name,
        "ts": tz.utc_iso(a.ts_utc),
        "status": a.status,
        "assignedTo": user_brief(a.assignee),
        "acknowledgedAt": tz.utc_iso(a.acknowledged_at),
        "resolvedAt": tz.utc_iso(a.resolved_at),
        "resolution": {
            "type": a.resolution_type,
            "rootCause": a.resolution_root_cause,
            "actionTaken": a.resolution_action_taken,
            "preventiveMeasures": a.resolution_preventive_measures,
            "timeSpentMinutes": a.resolution_time_spent_minutes,
        } if a.resolution_type else None,
    }
    if with_timeline:
        out["timeline"] = [serialize_event(e) for e in a.events]
    return out


def serialize_device(d: Device):
    return {
        "deviceId": d.device_id,
        "type": d.type,
        "company": d.company,
        "name": d.name,
        "location": d.location,
        "timezone": d.timezone,
        "floorCount": d.floor_count,
        "installedDate": d.installed_date,
        "readingTypes": d.reading_types,
        "alertThresholds": d.alert_thresholds,
    }


def serialize_reading(r: Reading, tzname: str):
    return {
        "timestamp": tz.utc_to_local_iso(r.ts_utc, tzname),
        "inputName": r.input_name,
        "inputValue": r.input_value,
        "breached": r.breached,
        "breachKind": r.breach_kind,
        "thresholdValue": r.threshold_value,
        "unexpectedType": r.unexpected_type,
        "suspect": r.suspect,
    }
