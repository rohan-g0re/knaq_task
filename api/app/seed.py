import json

from sqlalchemy.orm import Session

from .config import DATA_DIR
from .models import Device, User

# Static token -> user lookup. The frontend authenticates as Alice (Brookfield = most alerts).
USERS = [
    {"name": "Alice Chen", "role": "Facilities Manager", "company": "Brookfield Properties", "token": "brookfield-alice-token"},
    {"name": "Bob Martinez", "role": "Field Technician", "company": "Brookfield Properties", "token": "brookfield-bob-token"},
    {"name": "Carol Davis", "role": "Facilities Manager", "company": "Hines", "token": "hines-carol-token"},
    {"name": "Dan Wright", "role": "Field Technician", "company": "Hines", "token": "hines-dan-token"},
    {"name": "Emi Tanaka", "role": "Facilities Manager", "company": "Mitsui Fudosan", "token": "mitsui-emi-token"},
    {"name": "Frank Liu", "role": "Field Technician", "company": "Mitsui Fudosan", "token": "mitsui-frank-token"},
]


def seed(db: Session):
    devices = json.loads((DATA_DIR / "devices.json").read_text())
    db.add_all(Device(**d) for d in devices)
    db.add_all(User(**u) for u in USERS)
    db.commit()
