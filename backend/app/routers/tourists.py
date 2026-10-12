from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_tourist
from app.models import Tourist, User
from app.schemas.tourist import EmergencyInfo, TouristProfileRead, TouristProfileUpdate

router = APIRouter(prefix="/api/v1/tourists", tags=["tourists"])


def to_read(tourist: Tourist) -> TouristProfileRead:
    return TouristProfileRead(
        id=tourist.id,
        user_id=tourist.user_id,
        nationality=tourist.nationality,
        preferred_language=tourist.preferred_language,
        languages=tourist.languages,
        mobility_level=tourist.mobility_level,
        dietary=tourist.dietary,
        dietary_notes=tourist.dietary_notes,
        gender_preference=tourist.gender_preference,
        religious_needs=tourist.religious_needs,
        special_requests=tourist.special_requests,
        emergency=EmergencyInfo(
            blood_type=tourist.blood_type,
            emergency_contact_name=tourist.emergency_contact_name,
            emergency_contact_phone=tourist.emergency_contact_phone,
            medical_notes=tourist.medical_notes,
        ),
    )


@router.get("/me", response_model=TouristProfileRead)
def read_my_profile(
    user: User = Depends(require_tourist), db: Session = Depends(get_db)
):
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    if tourist is None:
        raise HTTPException(status_code=404, detail="Profile not created yet")
    return to_read(tourist)


@router.put("/me", response_model=TouristProfileRead)
def update_my_profile(
    data: TouristProfileUpdate,
    user: User = Depends(require_tourist),
    db: Session = Depends(get_db),
):
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    if tourist is None:
        tourist = Tourist(user_id=user.id)
        db.add(tourist)

    # The preferred language always counts as one of the tourist's languages
    languages = [data.preferred_language.value]
    for language in data.languages:
        if language.value not in languages:
            languages.append(language.value)

    tourist.nationality = data.nationality.upper() if data.nationality else None
    tourist.preferred_language = data.preferred_language
    tourist.languages = languages
    tourist.mobility_level = data.mobility_level
    tourist.dietary = [d.value for d in data.dietary]
    tourist.dietary_notes = data.dietary_notes
    tourist.gender_preference = data.gender_preference
    tourist.religious_needs = data.religious_needs
    tourist.special_requests = data.special_requests
    tourist.blood_type = data.emergency.blood_type
    tourist.emergency_contact_name = data.emergency.emergency_contact_name
    tourist.emergency_contact_phone = data.emergency.emergency_contact_phone
    tourist.medical_notes = data.emergency.medical_notes

    db.commit()
    db.refresh(tourist)
    return to_read(tourist)