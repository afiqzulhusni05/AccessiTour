from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.security import decode_access_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user

def require_tourist(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.TOURIST:
        raise HTTPException(status_code=403, detail="Only tourists can do this")
    return current_user


def require_guide(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.GUIDE:
        raise HTTPException(status_code=403, detail="Only guides can do this")
    return current_user 