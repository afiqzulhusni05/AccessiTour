import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_tourist
from app.matching import (
    GuideCandidate,
    SegmentRequest,
    ServiceInfo,
    TouristNeeds,
    match_guides,
)
from app.models import Guide, GuideAvailability, GuideService, Tourist, User
from app.schemas.matching import (
    ExcludedItem,
    FactorScoreRead,
    GuideSummary,
    MatchItem,
    MatchRequest,
    MatchResponse,
)

router = APIRouter(prefix="/api/v1/matching", tags=["matching"])


def load_guides(
    db: Session, start: dt.date, end: dt.date
) -> tuple[list[GuideCandidate], dict[int, tuple[Guide, User]]]:
    """Load every guide with their services and their availability between
    start and end, in three queries."""
    rows = db.execute(select(Guide, User).join(User, User.id == Guide.user_id)).all()
    guides_by_id = {guide.id: (guide, user) for guide, user in rows}

    services: dict[int, dict] = {guide_id: {} for guide_id in guides_by_id}
    for service in db.scalars(select(GuideService)):
        services.setdefault(service.guide_id, {})[service.service_type] = ServiceInfo(
            hourly_rate=service.hourly_rate,
            min_hours=service.min_hours,
            max_hours=service.max_hours,
            daily_rate=service.daily_rate,
        )

    availability: dict[int, list] = {guide_id: [] for guide_id in guides_by_id}
    slots = db.scalars(
        select(GuideAvailability).where(
            GuideAvailability.date >= start, GuideAvailability.date <= end
        )
    )
    for slot in slots:
        availability.setdefault(slot.guide_id, []).append(
            (slot.date, slot.start_time, slot.end_time)
        )

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
