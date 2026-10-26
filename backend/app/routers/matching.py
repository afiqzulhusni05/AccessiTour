import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_tourist
from app.enums import BookingStatus
from app.matching import (
    GuideCandidate,
    SegmentRequest,
    ServiceInfo,
    TouristNeeds,
    match_guides,
    remove_booked,
)
from app.models import Booking, Guide, GuideAvailability, GuideService, Tourist, User
from app.schemas.matching import (
    ExcludedItem,
    FactorScoreRead,
    GuideSummary,
    MatchItem,
    MatchRequest,
    MatchResponse,
)

router = APIRouter(prefix="/api/v1/matching", tags=["matching"])

# Bookings in these statuses hold the guide's time. A REQUESTED booking doesn't,
# so one tourist can't block a guide just by sending a request.
BLOCKING_STATUSES = (
    BookingStatus.ACCEPTED,
    BookingStatus.ITINERARY_DRAFT,
    BookingStatus.IN_REVIEW,
    BookingStatus.CONFIRMED,
)


def booked_times(
    db: Session, start: dt.date, end: dt.date, guide_ids: list[int] | None = None
) -> dict[int, list[tuple[dt.date, dt.time | None, dt.time | None]]]:
    """Each guide's booked days (and hours, for MICRO) between start and end."""
    query = select(Booking).where(
        Booking.status.in_(BLOCKING_STATUSES),
        Booking.start_date <= end,
        Booking.end_date >= start,
    )
    if guide_ids is not None:
        query = query.where(Booking.guide_id.in_(guide_ids))

    booked: dict[int, list] = {}
    for booking in db.scalars(query):
        day = booking.start_date
        while day <= booking.end_date:
            booked.setdefault(booking.guide_id, []).append(
                (day, booking.start_time, booking.end_time)
            )
            day += dt.timedelta(days=1)
    return booked


def load_guides(
    db: Session, start: dt.date, end: dt.date, guide_ids: list[int] | None = None
) -> tuple[list[GuideCandidate], dict[int, tuple[Guide, User]]]:
    """Load guides (all of them, or only guide_ids) with their services and
    their free time between start and end, minus time already booked."""
    query = select(Guide, User).join(User, User.id == Guide.user_id)
    if guide_ids is not None:
        query = query.where(Guide.id.in_(guide_ids))
    rows = db.execute(query).all()
    guides_by_id = {guide.id: (guide, user) for guide, user in rows}
    ids = list(guides_by_id)

    services: dict[int, dict] = {guide_id: {} for guide_id in guides_by_id}
    for service in db.scalars(select(GuideService).where(GuideService.guide_id.in_(ids))):
        services.setdefault(service.guide_id, {})[service.service_type] = ServiceInfo(
            hourly_rate=service.hourly_rate,
            min_hours=service.min_hours,
            max_hours=service.max_hours,
            daily_rate=service.daily_rate,
        )

    availability: dict[int, list] = {guide_id: [] for guide_id in guides_by_id}
    slots = db.scalars(
        select(GuideAvailability).where(
            GuideAvailability.guide_id.in_(ids),
            GuideAvailability.date >= start,
            GuideAvailability.date <= end,
        )
    )
    for slot in slots:
        availability.setdefault(slot.guide_id, []).append(
            (slot.date, slot.start_time, slot.end_time)
        )

    for guide_id, booked in booked_times(db, start, end, ids).items():
        availability[guide_id] = remove_booked(availability[guide_id], booked)

    candidates = [
        GuideCandidate(
            id=guide.id,
            full_name=user.full_name,
            gender=guide.gender.value,
            languages=guide.languages,
            regions=guide.regions,
            attributes=guide.attributes,
            accessibility_experience=guide.accessibility_experience,
            transport_options=guide.transport_options,
            max_group_size=guide.max_group_size,
            rating_average=guide.rating_average,
            rating_count=guide.rating_count,
            services=services[guide.id],
            availability=availability[guide.id],
        )
        for guide, user in guides_by_id.values()
    ]
    return candidates, guides_by_id


def summary(guide: Guide, user: User) -> GuideSummary:
    return GuideSummary(
        id=guide.id,
        full_name=user.full_name,
        gender=guide.gender,
        languages=guide.languages,
        regions=guide.regions,
        attributes=guide.attributes,
        accessibility_experience=guide.accessibility_experience,
        transport_options=guide.transport_options,
        verified=guide.verified,
        rating_average=guide.rating_average,
        rating_count=guide.rating_count,
    )


@router.post("/preview", response_model=MatchResponse)
def preview_matches(
    data: MatchRequest,
    user: User = Depends(require_tourist),
    db: Session = Depends(get_db),
):
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    if tourist is None:
        raise HTTPException(status_code=400, detail="Create your tourist profile first")
    if data.start_date < dt.date.today():
        raise HTTPException(status_code=400, detail="start_date cannot be in the past")

    needs = TouristNeeds(
        preferred_language=tourist.preferred_language.value,
        languages=tourist.languages,
        mobility_level=tourist.mobility_level,
        gender_preference=tourist.gender_preference,
    )
    segment = SegmentRequest(
        region=data.region.value,
        service_type=data.service_type,
        start_date=data.start_date,
        end_date=data.end_date,
        start_time=data.start_time,
        end_time=data.end_time,
        group_size=data.group_size,
        transport_preference=data.transport_preference,
        attributes=[a.value for a in data.attributes],
        budget=data.budget,
    )

    candidates, guides_by_id = load_guides(db, data.start_date, data.end_date)
    results, excluded = match_guides(needs, segment, candidates)

    return MatchResponse(
        total=len(results),
        items=[
            MatchItem(
                guide=summary(*guides_by_id[r.guide.id]),
                total_score=r.total_score,
                estimated_price=r.estimated_price,
                breakdown=[FactorScoreRead.model_validate(f) for f in r.breakdown],
            )
            for r in results
        ],
        excluded=[
            ExcludedItem(guide_id=e.guide.id, full_name=e.guide.full_name, reason=e.reason)
            for e in excluded
        ],
    )