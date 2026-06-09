from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        raise HTTPException(401, "Missing bearer token.")
    user = db.query(User).filter(User.token == creds.credentials).first()
    if not user:
        raise HTTPException(401, "Invalid bearer token.")
    return user


def scoped(stmt, model, user: User):
    """Append the company filter that makes every query multi-tenant by default."""
    return stmt.where(model.company == user.company)
