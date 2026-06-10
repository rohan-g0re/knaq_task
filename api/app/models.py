from sqlalchemy import (
    JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .db import Base


class Device(Base):
    __tablename__ = "devices"
    device_id = Column(String, primary_key=True)
    type = Column(String)
    company = Column(String, index=True)
    name = Column(String)
    location = Column(String)
    timezone = Column(String)
    floor_count = Column(Integer, nullable=True)
    installed_date = Column(String)
    reading_types = Column(JSON)
    alert_thresholds = Column(JSON)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    role = Column(String)
    company = Column(String, index=True)
    token = Column(String, unique=True, index=True)


class Reading(Base):
    __tablename__ = "readings"
    id = Column(Integer, primary_key=True)
    device_id = Column(String, ForeignKey("devices.device_id"), index=True)
    ts_utc = Column(DateTime, index=True)
    input_name = Column(String)
    input_value = Column(Float)
    breached = Column(Boolean, default=False)
    breach_kind = Column(String, nullable=True)        # current_high | frequency_low | ...
    threshold_value = Column(Float, nullable=True)
    unexpected_type = Column(Boolean, default=False)   # not in device.reading_types
    suspect = Column(Boolean, default=False)           # physically implausible (e.g. negative current)
    anomaly = Column(Boolean, default=False)           # in-range but unusual vs recent history (z-score)
    __table_args__ = (
        UniqueConstraint("device_id", "ts_utc", "input_name", "input_value", name="uq_reading"),
        Index("ix_readings_device_ts", "device_id", "ts_utc"),
    )


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True)
    device_id = Column(String, ForeignKey("devices.device_id"))
    company = Column(String, index=True)               # denormalized from device for scoping
    ts_utc = Column(DateTime, index=True)
    alert_type = Column(String)
    severity = Column(String)
    threshold = Column(Float, nullable=True)
    reading_value = Column(Float, nullable=True)
    reading_name = Column(String, nullable=True)
    title = Column(String)                             # derived at ingest

    status = Column(String, default="new")             # new | acknowledged | resolved | dismissed
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_type = Column(String, nullable=True)
    resolution_root_cause = Column(Text, nullable=True)
    resolution_action_taken = Column(Text, nullable=True)
    resolution_preventive_measures = Column(Text, nullable=True)
    resolution_time_spent_minutes = Column(Integer, nullable=True)

    device = relationship("Device")
    assignee = relationship("User")
    events = relationship("AlertEvent", order_by="AlertEvent.id", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("device_id", "ts_utc", "alert_type", name="uq_alert"),)


class AlertEvent(Base):
    __tablename__ = "alert_events"
    id = Column(Integer, primary_key=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), index=True)
    ts = Column(DateTime)
    action = Column(String)                            # created | acknowledged | assigned | resolved | note
    user_name = Column(String, nullable=True)
    details = Column(String, nullable=True)
    note = Column(Text, nullable=True)


class Recovery(Base):
    __tablename__ = "recoveries"
    id = Column(Integer, primary_key=True)
    device_id = Column(String, ForeignKey("devices.device_id"), index=True)
    company = Column(String, index=True)
    ts_utc = Column(DateTime, index=True)
    alert_type = Column(String)
    severity = Column(String, nullable=True)
    threshold = Column(Float, nullable=True)
    reading_value = Column(Float, nullable=True)
    reading_name = Column(String, nullable=True)


class RejectedMessage(Base):
    __tablename__ = "rejected_messages"
    id = Column(Integer, primary_key=True)
    raw = Column(Text)
    reason = Column(String)
    ts_ingested = Column(DateTime)
