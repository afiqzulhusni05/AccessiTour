import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_guide
from app.enums import Language, Region, ServiceType, TransportOption
from app.models import Guide, GuideAvailability, GuideService, User
from app.schemas.guide import (
    AvailabilitySlot,
    AvailabilityUpdate,
    GuideListPage,
    GuideProfileRead,
    GuideProfileUpdate,
    GuideServiceRead,
    GuideServicesUpdate,
)

router = APIRouter(prefix="/api/v1/guides", tags=["guides"])


# ---------- Helpers ----------


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


def load_availability(
    db: Session, guide_id: int, start: dt.date, end: dt.date
) -> list[GuideAvailability]:
    return list(
        db.scalars(
            select(GuideAvailability)
            .where(
                GuideAvailability.guide_id == guide_id,
                GuideAvailability.date >= start,
                GuideAvailability.date <= end,
            )
            .order_by(GuideAvailability.date, GuideAvailability.start_time)
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


# ---------- The logged-in guide's own profile ----------
# These /me routes must stay above the /{guide_id} routes further down.


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


@router.get("/me/availability", response_model=list[AvailabilitySlot])
def read_my_availability(
    user: User = Depends(require_guide), db: Session = Depends(get_db)
):
    guide = get_guide_for_user(db, user)
    if guide is None:
        raise HTTPException(status_code=404, detail="Profile not created yet")
    today = dt.date.today()
    return load_availability(db, guide.id, today, today + dt.timedelta(days=365))


@router.put("/me/availability", response_model=list[AvailabilitySlot])
def update_my_availability(
    data: AvailabilityUpdate,
    user: User = Depends(require_guide),
    db: Session = Depends(get_db),
):
    guide = get_guide_for_user(db, user)
    if guide is None:
        raise HTTPException(status_code=400, detail="Create your guide profile first")

    today = dt.date.today()
    if any(slot.date < today for slot in data.slots):
        raise HTTPException(status_code=400, detail="Availability cannot be in the past")

    # Replace all upcoming availability; past records are kept
    db.execute(
        delete(GuideAvailability).where(
            GuideAvailability.guide_id == guide.id,
            GuideAvailability.date >= today,
        )
    )
    for slot in data.slots:
        db.add(
            GuideAvailability(
                guide_id=guide.id,
                date=slot.date,
                start_time=slot.start_time,
                end_time=slot.end_time,
            )
        )

    db.commit()
    return load_availability(db, guide.id, today, today + dt.timedelta(days=365))


# ---------- Browsing guides (any logged-in user) ----------


@router.get("", response_model=GuideListPage)
def list_guides(
    region: Region | None = None,
    language: Language | None = None,
    service_type: ServiceType | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Guide)
    if region is not None:
        query = query.where(Guide.regions.contains([region.value]))
    if language is not None:
        query = query.where(Guide.languages.contains([language.value]))
    if service_type is not None:
        query = query.where(
            Guide.id.in_(
                select(GuideService.guide_id).where(
                    GuideService.service_type == service_type
                )
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    guides = list(
        db.scalars(
            query.order_by(Guide.rating_average.desc(), Guide.id)
            .offset((page - 1) * size)
            .limit(size)
        )
    )
    users = {
        u.id: u
        for u in db.scalars(select(User).where(User.id.in_([g.user_id for g in guides])))
    }

    return GuideListPage(
        items=[to_read(db, g, users[g.user_id]) for g in guides],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{guide_id}", response_model=GuideProfileRead)
def read_guide(
    guide_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    guide = db.get(Guide, guide_id)
    if guide is None:
        raise HTTPException(status_code=404, detail="Guide not found")
    return to_read(db, guide, db.get(User, guide.user_id))


@router.get("/{guide_id}/availability", response_model=list[AvailabilitySlot])
def read_guide_availability(
    guide_id: int,
    from_date: dt.date | None = Query(default=None, alias="from"),
    to_date: dt.date | None = Query(default=None, alias="to"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(Guide, guide_id) is None:
        raise HTTPException(status_code=404, detail="Guide not found")

    start = from_date or dt.date.today()
    end = to_date or start + dt.timedelta(days=30)
    if end < start:
        raise HTTPException(status_code=400, detail="'to' must be on or after 'from'")
    if (end - start).days > 90:
        raise HTTPException(status_code=400, detail="Date range can be at most 90 days")

    return load_availability(db, guide_id, start, end)