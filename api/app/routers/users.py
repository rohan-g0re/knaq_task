from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, scoped
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(db: Session = Depends(get_db), user: User = Depends(current_user)):
    users = db.scalars(scoped(select(User), User, user).order_by(User.name)).all()
    return {"data": [{"id": u.id, "name": u.name, "role": u.role, "company": u.company} for u in users]}
