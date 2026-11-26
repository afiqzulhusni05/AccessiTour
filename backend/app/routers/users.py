from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Booking, Guide, Tourist, Trip, TripSegment, User, UserPhoto, UserRole
from app.schemas.user import UserRead
from app.services.photos import MAX_UPLOAD_BYTES, PhotoError, make_profile_photo

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me/photo", response_model=UserRead)
async def upload_my_photo(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sets or replaces the signed-in user's profile photo (JPEG, PNG or WebP, up to 5 MB)."""
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        jpeg = make_profile_photo(raw)
    except PhotoError as e:
        status = 413 if len(raw) > MAX_UPLOAD_BYTES else 422
        raise HTTPException(status_code=status, detail=str(e)) from e

    photo = db.get(UserPhoto, current_user.id)
    if photo is None:
        db.add(UserPhoto(user_id=current_user.id, data=jpeg, content_type="image/jpeg"))
    else:
        photo.data = jpeg
        photo.content_type = "image/jpeg"
    current_user.photo_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/photo", response_model=UserRead)
def delete_my_photo(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    photo = db.get(UserPhoto, current_user.id)
    if photo is not None:
        db.delete(photo)
    current_user.photo_updated_at = None
    db.commit()
    db.refresh(current_user)
    return current_user


def can_see_photo(db: Session, viewer: User, owner: User) -> bool:
    """Your own photo; any guide's photo (guides are listed publicly to tourists); a tourist's
    photo only for a guide that tourist has booked (any booking status)."""
    if viewer.id == owner.id or owner.role == UserRole.GUIDE:
        return True
    if viewer.role != UserRole.GUIDE:
        return False
    return db.scalar(
        select(Booking.id)
        .join(TripSegment, TripSegment.id == Booking.segment_id)
        .join(Trip, Trip.id == TripSegment.trip_id)
        .join(Tourist, Tourist.id == Trip.tourist_id)
        .join(Guide, Guide.id == Booking.guide_id)
        .where(Tourist.user_id == owner.id, Guide.user_id == viewer.id)
        .limit(1)
    ) is not None


@router.get("/{user_id}/photo")
def read_photo(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The photo as image bytes. Anyone not allowed to see it gets 404, the same as no photo."""
    owner = db.get(User, user_id)
    photo = db.get(UserPhoto, user_id) if owner else None
    if photo is None or not can_see_photo(db, current_user, owner):
        raise HTTPException(status_code=404, detail="No photo")
    # The URL carries a version (?v=), so a changed photo has a new URL and can be cached for long.
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
