import json
import logging
from collections import defaultdict, deque
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .config import DATA_DIR
from .models import Alert, AlertEvent, Device, Reading, Recovery, RejectedMessage
from .titles import build_title
from .tz import from_epoch_ms

log = logging.getLogger("ingest")

VALID_TYPES = {"reading", "alert", "recovery"}
CHECKED_INPUTS = {"current", "frequency", "temperature"}  # motor_status has no threshold


def _breach(input_name: str, value: float, thresholds: dict):
    """-> (breached, breach_kind, threshold_value) for a numeric input vs device thresholds."""
    high, low = thresholds.get(f"{input_name}_high"), thresholds.get(f"{input_name}_low")
    if high is not None and value > high:
        return True, f"{input_name}_high", high
    if low is not None and value < low:
        return True, f"{input_name}_low", low
    return False, None, None


def run_ingest(db: Session) -> dict:
    devices = {d.device_id: d for d in db.query(Device).all()}
    messages = json.loads((DATA_DIR / "sensor_messages.json").read_text())
    now = datetime.utcnow()
    counts = {"readings": 0, "alerts": 0, "recoveries": 0, "duplicates": 0, "rejected": 0}

    def reject(msg, reason):
        db.add(RejectedMessage(raw=json.dumps(msg), reason=reason, ts_ingested=now))
        counts["rejected"] += 1

    for m in messages:
        mtype = m.get("message_type")
        if mtype not in VALID_TYPES:
            reject(m, f"invalid message_type: {mtype!r}")
            continue
        ts_raw = m.get("timestamp")
        if not isinstance(ts_raw, (int, float)) or isinstance(ts_raw, bool):
            reject(m, f"missing or non-numeric timestamp: {ts_raw!r}")
            continue
        device = devices.get(m.get("device_id"))
        if not device:
            reject(m, f"unknown or missing device_id: {m.get('device_id')!r}")
            continue

        ts = from_epoch_ms(ts_raw)

        if mtype == "reading":
            inputs = m.get("inputs")
            if not inputs:
                reject(m, "reading has no inputs")
                continue
            for inp in inputs:
                name, value = inp.get("input_name"), inp.get("input_value")
                if name is None or value is None:
                    continue
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    continue  # non-numeric sensor value -> drop this input
                unexpected = name not in (device.reading_types or [])
                breached = kind = thresh = None
                suspect = name == "current" and value < 0
                if not unexpected and name in CHECKED_INPUTS:
                    breached, kind, thresh = _breach(name, value, device.alert_thresholds or {})
                row = sqlite_insert(Reading).values(
                    device_id=device.device_id, ts_utc=ts, input_name=name, input_value=value,
                    breached=bool(breached), breach_kind=kind, threshold_value=thresh,
                    unexpected_type=unexpected, suspect=suspect,
                ).on_conflict_do_nothing()
                res = db.execute(row)
                if res.rowcount:
                    counts["readings"] += 1
                else:
                    counts["duplicates"] += 1

        elif mtype == "alert":
            if not m.get("alert_type") or not m.get("severity"):
                reject(m, "alert missing alert_type or severity")
                continue
            exists = db.query(Alert.id).filter_by(
                device_id=device.device_id, ts_utc=ts, alert_type=m["alert_type"]
            ).first()
            if exists:
                counts["duplicates"] += 1
                continue
            alert = Alert(
                device_id=device.device_id, company=device.company, ts_utc=ts,
                alert_type=m["alert_type"], severity=m["severity"],
                threshold=m.get("threshold"), reading_value=m.get("reading_value"),
                reading_name=m.get("reading_name"),
                title=build_title(m["alert_type"], device.name), status="new",
            )
            alert.events.append(AlertEvent(ts=ts, action="created", details="Alert ingested from device"))
            db.add(alert)
            counts["alerts"] += 1

        else:  # recovery
            if not m.get("alert_type") or not m.get("severity"):
                reject(m, "recovery missing alert_type or severity")
                continue
            dup = db.query(Recovery.id).filter_by(
                device_id=device.device_id, ts_utc=ts, alert_type=m["alert_type"]
            ).first()
            if dup:
                counts["duplicates"] += 1
                continue
            db.add(Recovery(
                device_id=device.device_id, company=device.company, ts_utc=ts,
                alert_type=m["alert_type"], severity=m.get("severity"),
                threshold=m.get("threshold"), reading_value=m.get("reading_value"),
                reading_name=m.get("reading_name"),
            ))
            counts["recoveries"] += 1

    db.commit()
    counts["anomalies"] = flag_anomalies(db)
    log.info("ingest done: %s", counts)
    return counts


# Z=2.5: this synthetic data is wide/noisy (observed max z ~2.87), so the classic 3-sigma
# cutoff flags nothing. 2.5 sigma is a standard outlier threshold and surfaces the genuinely
# most-deviant in-range readings (~0.25% here) without becoming noise.
WINDOW, MIN_HISTORY, Z = 20, 10, 2.5


def flag_anomalies(db: Session) -> int:
    """In-range readings that deviate >3 sigma from the last 20 of the same device+input.
    Distinct from `breached` (that's crossing a fixed threshold; this is 'unusual for this machine')."""
    rows = db.scalars(
        select(Reading)
        .where(Reading.input_name.in_(CHECKED_INPUTS), Reading.unexpected_type.is_(False))
        .order_by(Reading.ts_utc)
    ).all()
    windows: dict = defaultdict(lambda: deque(maxlen=WINDOW))
    flagged = 0
    for r in rows:
        w = windows[(r.device_id, r.input_name)]
        if not r.breached and len(w) >= MIN_HISTORY:
            mean = sum(w) / len(w)
            std = (sum((x - mean) ** 2 for x in w) / len(w)) ** 0.5
            if std > 0 and abs(r.input_value - mean) > Z * std:
                r.anomaly = True
                flagged += 1
        w.append(r.input_value)
    db.commit()
    return flagged
