from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_guide
from app.enums import TransportOption
from app.models import Guide, GuideService, User
from app.schemas.guide import (
    GuideProfileRead,
    GuideProfileUpdate,
    GuideServiceRead,
    GuideServicesUpdate,
)

router = APIRouter(prefix="/api/v1/guides", tags=["guides"])


def get_guide_for_user(db: Session, user: User) -> Guide | None:
    return db.scalar(select(Guide).where(Guide.user_id == user.id))


def load_services(db: Session, guide_id: int) -> list[GuideService]:
    return list(
        db.scalars(
            select(GuideService)
            .where(GuideService.guide_id == guide_id)
            .order_by(GuideService.service_type)
        )
    )


def to_read(db: Session, guide: Guide, user: User) -> GuideProfileRead:
    return GuideProfileRead(
        id=guide.id,
        user_id=guide.user_id,
        full_name=user.full_name,
        gender=guide.gender,
        description=guide.description,
        languages=guide.languages,
        regions=guide.regions,
        attributes=guide.attributes,
        accessibility_experience=guide.accessibility_experience,
        transport_options=guide.transport_options,
        max_group_size=guide.max_group_size,
        verified=guide.verified,
        rating_average=guide.rating_average,
        rating_count=guide.rating_count,
        services=[
            GuideServiceRead.model_validate(s) for s in load_services(db, guide.id)
        ],
    )


@router.get("/me", response_model=GuideProfileRead)
def read_my_guide_profile(
    user: User = Depends(require_guide), db: Session = Depends(get_db)
):
    guide = get_guide_for_user(db, user)
    if guide is None:
        raise HTTPException(status_code=404, detail="Profile not created yet")
    return to_read(db, guide, user)


@router.put("/me", response_model=GuideProfileRead)
def update_my_guide_profile(
    data: GuideProfileUpdate,
    user: User = Depends(require_guide),
    db: Session = Depends(get_db),
):
    guide = get_guide_for_user(db, user)
    if guide is None:
        guide = Guide(user_id=user.id)
        db.add(guide)

    # Every guide can accompany tourists on public transport
    transport = [TransportOption.PUBLIC_TRANSIT.value]
    for option in data.transport_options:
        if option.value not in transport:
            transport.append(option.value)

    guide.gender = data.gender
    guide.description = data.description
    guide.languages = list(dict.fromkeys(l.value for l in data.languages))
    guide.regions = list(dict.fromkeys(r.value for r in data.regions))
    guide.attributes = list(dict.fromkeys(a.value for a in data.attributes))
    guide.accessibility_experience = list(
        dict.fromkeys(a.value for a in data.accessibility_experience)
    )
    guide.transport_options = transport
    guide.max_group_size = data.max_group_size

    db.commit()
    db.refresh(guide)
    return to_read(db, guide, user)


@router.put("/me/services", response_model=GuideProfileRead)
def update_my_services(
    data: GuideServicesUpdate,
    user: User = Depends(require_guide),
    db: Session = Depends(get_db),
):
    guide = get_guide_for_user(db, user)
    if guide is None:
        raise HTTPException(status_code=400, detail="Create your guide profile first")

    # Replace the whole list: services left out are no longer offered
    db.execute(delete(GuideService).where(GuideService.guide_id == guide.id))
    for service in data.services:
        db.add(
            GuideService(
                guide_id=guide.id,
                service_type=service.service_type,
                hourly_rate=service.hourly_rate,
                min_hours=service.min_hours,
                max_hours=service.max_hours,
                daily_rate=service.daily_rate,
            )
        )

    db.commit()
    return to_read(db, guide, user)