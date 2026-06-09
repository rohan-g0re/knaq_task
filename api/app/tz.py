from datetime import datetime, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc


def from_epoch_ms(ms: int) -> datetime:
    """Epoch ms (UTC) -> naive UTC datetime (how we store everything)."""
    return datetime.fromtimestamp(ms / 1000, tz=UTC).replace(tzinfo=None)


def local_to_utc(value: str, tzname: str) -> datetime:
    """Parse an ISO string given in the device's local tz -> naive UTC datetime."""
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(tzname))
    return dt.astimezone(UTC).replace(tzinfo=None)


def utc_to_local_iso(dt: datetime, tzname: str) -> str:
    """Naive UTC datetime -> ISO-8601 string in the device's local tz (with offset)."""
    return dt.replace(tzinfo=UTC).astimezone(ZoneInfo(tzname)).isoformat()


def utc_iso(dt: datetime | None) -> str | None:
    """Naive UTC datetime -> ISO-8601 Zulu string."""
    return dt.replace(tzinfo=UTC).isoformat() if dt else None
