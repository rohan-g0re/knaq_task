from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, scoped
from ..db import get_db
from ..models import Device, Reading, User
from ..schemas import serialize_device, serialize_reading
from ..tz import local_to_utc

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_device(db, user, device_id) -> Device:
    device = db.get(Device, device_id)
    if not device or device.company != user.company:
        raise HTTPException(404, "Device not found.")
    return device


@router.get("")
def list_devices(db: Session = Depends(get_db), user: User = Depends(current_user)):
    devices = db.scalars(scoped(select(Device), Device, user).order_by(Device.device_id)).all()
    return {"data": [serialize_device(d) for d in devices]}


@router.get("/{device_id}")
def get_device(device_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return serialize_device(_get_device(db, user, device_id))


@router.get("/{device_id}/readings")
def device_readings(
    device_id: str,
    start: str = Query(..., description="device-local ISO datetime"),
    end: str = Query(..., description="device-local ISO datetime"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    device = _get_device(db, user, device_id)
    try:
        start_utc, end_utc = local_to_utc(start, device.timezone), local_to_utc(end, device.timezone)
    except ValueError:
        raise HTTPException(422, "start/end must be ISO-8601 datetimes.")
    rows = db.scalars(
        select(Reading)
        .where(Reading.device_id == device_id, Reading.ts_utc >= start_utc, Reading.ts_utc <= end_utc)
        .order_by(Reading.ts_utc)
    ).all()
    return {
        "deviceId": device_id,
        "timezone": device.timezone,
        "data": [serialize_reading(r, device.timezone) for r in rows],
    }
