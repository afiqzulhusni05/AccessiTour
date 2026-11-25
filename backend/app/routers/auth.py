import datetime as dt

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.mailer import send_mail
from app.models import PasswordReset, User
from app.password_reset_rules import LINK_MINUTES, MAX_LINKS_PER_HOUR, link_problem, new_token, reset_link, token_hash
from app.schemas.user import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, Token, UserCreate, UserRead
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    email = data.email.lower()

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(
        email=email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user.id))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: ForgotPasswordRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Emails a link to choose a new password. The answer is the same whether or not the
    email has an account, so this can't be used to find out who is registered."""
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is not None:
        now = dt.datetime.now(dt.timezone.utc)
        recent = db.query(PasswordReset).filter(
            PasswordReset.user_id == user.id, PasswordReset.created_at > now - dt.timedelta(hours=1)
        ).count()
        if recent < MAX_LINKS_PER_HOUR:
            # only the newest link works
            for old in db.scalars(select(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))):
                old.used_at = now
            token, hashed = new_token()
            db.add(PasswordReset(user_id=user.id, token_hash=hashed, expires_at=now + dt.timedelta(minutes=LINK_MINUTES)))
            db.commit()
            link = reset_link(settings.frontend_url, token)
            background.add_task(
                send_mail, user.email, "Reset your AccessiTour password",
                f"Hi {user.full_name},\n\n"
                f"Someone asked to reset the password for your AccessiTour account. "
                f"To choose a new password, open this link within {LINK_MINUTES} minutes:\n\n{link}\n\n"
                "If it wasn't you, ignore this email; your password stays the same.\n\nAccessiTour",
            )
    return {"ok": True}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Sets a new password with the token from the emailed link. Each link works once."""
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash(data.token)))
    if reset is None:
        raise HTTPException(status_code=400, detail="This link isn't valid. Ask for a new one.")
    problem = link_problem(reset.expires_at, reset.used_at, dt.datetime.now(dt.timezone.utc))
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user = db.get(User, reset.user_id)
    user.hashed_password = hash_password(data.new_password)
    reset.used_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    return {"ok": True}
