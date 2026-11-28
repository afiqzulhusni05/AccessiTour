import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_tourist
from app.matching import (
    SegmentRequest,
    TouristNeeds,
    combine_whole_trip,
    connecting_options,
    match_guides,
    plan_coverage,
)
from app.deletion_rules import trip_delete_problem
from app.models import Booking, Tourist, Trip, TripSegment, User
from app.enums import BookingStatus, ServiceType
from app.routers.matching import BLOCKING_STATUSES, load_guides, summary
from app.schemas.matching import (
    ConnectingLegRead,
    ConnectingLegWithAlternatives,
    ConnectingOptionsResponse,
    ConnectingPlanRead,
    CoverageBlockRead,
    CoverageOptionRead,
    CoveragePlanResponse,
    ExcludedItem,
    FactorScoreRead,
    MatchItem,
)
from app.schemas.trip import (
    SegmentMatches,
    SegmentRead,
    SegmentScore,
    TripCreate,
    TripMatchResponse,
    TripRead,
    WholeTripItem,
)

router = APIRouter(prefix="/api/v1/trips", tags=["trips"])

WHOLE_TRIP_LIMIT = 10  # how many guides to show in the whole-trip list


# ---------- Helpers ----------


def get_tourist(db: Session, user: User) -> Tourist:
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    if tourist is None:
        raise HTTPException(status_code=400, detail="Create your tourist profile first")
    return tourist


def load_segments(db: Session, trip_id: int) -> list[TripSegment]:
    return list(
        db.scalars(
            select(TripSegment)
            .where(TripSegment.trip_id == trip_id)
            .order_by(TripSegment.position)
        )
    )


def get_own_trip(db: Session, tourist: Tourist, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)
    # Someone else's trip looks the same as a missing one, so IDs can't be probed
    if trip is None or trip.tourist_id != tourist.id:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def to_read(trip: Trip, segments: list[TripSegment]) -> TripRead:
    return TripRead(
        id=trip.id,
        title=trip.title,
        start_date=min(s.start_date for s in segments),
        end_date=max(s.end_date for s in segments),
        created_at=trip.created_at,
        segments=[SegmentRead.model_validate(s) for s in segments],
    )


def to_segment_request(segment: TripSegment) -> SegmentRequest:
    return SegmentRequest(
        region=segment.region.value,
        service_type=segment.service_type,
        start_date=segment.start_date,
        end_date=segment.end_date,
        start_time=segment.start_time,
        end_time=segment.end_time,
        group_size=segment.group_size,
        transport_preference=segment.transport_preference,
        attributes=segment.attributes,
        budget=segment.budget,
    )


# ---------- Endpoints ----------


@router.post("", response_model=TripRead, status_code=201)
def create_trip(
    data: TripCreate,
    user: User = Depends(require_tourist),
    db: Session = Depends(get_db),
):
    tourist = get_tourist(db, user)
    if any(s.start_date < dt.date.today() for s in data.segments):
        raise HTTPException(status_code=400, detail="Segments cannot start in the past")

    trip = Trip(tourist_id=tourist.id, title=data.title)
    db.add(trip)
    db.flush()  # gives the trip its ID

    ordered = sorted(data.segments, key=lambda s: (s.start_date, s.start_time or dt.time(0)))
    for position, s in enumerate(ordered):
        db.add(
            TripSegment(
                trip_id=trip.id,
                position=position,
                region=s.region,
                service_type=s.service_type,
                start_date=s.start_date,
                end_date=s.end_date,
                start_time=s.start_time,
                end_time=s.end_time,
                group_size=s.group_size,
                transport_preference=s.transport_preference,
                attributes=[a.value for a in s.attributes],
                budget=s.budget,
            )
        )

    db.commit()
    db.refresh(trip)
    return to_read(trip, load_segments(db, trip.id))


@router.get("", response_model=list[TripRead])
def list_my_trips(user: User = Depends(require_tourist), db: Session = Depends(get_db)):
    tourist = get_tourist(db, user)
    trips = db.scalars(
        select(Trip).where(Trip.tourist_id == tourist.id).order_by(Trip.created_at.desc())
    )
    return [to_read(trip, load_segments(db, trip.id)) for trip in trips]


@router.get("/{trip_id}", response_model=TripRead)
def read_trip(
    trip_id: int, user: User = Depends(require_tourist), db: Session = Depends(get_db)
):
    tourist = get_tourist(db, user)
    trip = get_own_trip(db, tourist, trip_id)
    return to_read(trip, load_segments(db, trip.id))


@router.get("/{trip_id}/matches", response_model=TripMatchResponse)
def match_trip(
    trip_id: int, user: User = Depends(require_tourist), db: Session = Depends(get_db)
):
    tourist = get_tourist(db, user)
    trip = get_own_trip(db, tourist, trip_id)
    segments = load_segments(db, trip.id)

    needs = TouristNeeds(
        preferred_language=tourist.preferred_language.value,
        languages=tourist.languages,
        mobility_level=tourist.mobility_level,
        gender_preference=tourist.gender_preference,
    )

    # Load every guide once, with availability covering the whole trip
    candidates, guides_by_id = load_guides(
        db, min(s.start_date for s in segments), max(s.end_date for s in segments)
    )

    segment_lists = []
    per_segment_results = []
    for segment in segments:
        results, excluded = match_guides(needs, to_segment_request(segment), candidates)
        per_segment_results.append(results)
        segment_lists.append(
            SegmentMatches(
                segment=SegmentRead.model_validate(segment),
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
                    ExcludedItem(
                        guide_id=e.guide.id, full_name=e.guide.full_name, reason=e.reason
                    )
                    for e in excluded
                ],
            )
        )

    whole_trip = []
    if len(segments) > 1:
        for w in combine_whole_trip(per_segment_results)[:WHOLE_TRIP_LIMIT]:
            whole_trip.append(
                WholeTripItem(
                    guide=summary(*guides_by_id[w.guide.id]),
                    segments_covered=w.segments_covered,
                    segments_total=w.segments_total,
                    coverage=(
                        "Covers your whole trip"
                        if w.segments_covered == w.segments_total
                        else f"Covers {w.segments_covered} of {w.segments_total} parts of your trip"
                    ),
                    average_score=w.average_score,
                    total_price=w.total_price,
                    segment_scores=[
                        SegmentScore(segment_id=s.id, total_score=score)
                        for s, score in zip(segments, w.segment_scores)
                    ],
                )
            )

    return TripMatchResponse(trip_id=trip.id, segments=segment_lists, whole_trip=whole_trip)

@router.get("/segments/{segment_id}/coverage-plan", response_model=CoveragePlanResponse)
def segment_coverage_plan(
    segment_id: int, user: User = Depends(require_tourist), db: Session = Depends(get_db)
):
    """When no single guide is free for every day of a segment, suggest a chain of guides.
    Days already covered by an active booking on this segment are left out."""
    tourist = get_tourist(db, user)
    segment = db.get(TripSegment, segment_id)
    if segment is None or db.get(Trip, segment.trip_id).tourist_id != tourist.id:
        raise HTTPException(status_code=404, detail="Trip segment not found")
    if segment.service_type == ServiceType.MICRO:
        raise HTTPException(status_code=400, detail="A short session is one day and can't be split")

    needs = TouristNeeds(
        preferred_language=tourist.preferred_language.value,
        languages=tourist.languages,
        mobility_level=tourist.mobility_level,
        gender_preference=tourist.gender_preference,
    )
    request = to_segment_request(segment)

    taken: set[dt.date] = set()
    active = (BookingStatus.REQUESTED, *BLOCKING_STATUSES)
    for b in db.scalars(
        select(Booking).where(Booking.segment_id == segment.id, Booking.status.in_(active))
    ):
        day = b.start_date
        while day <= b.end_date:
            taken.add(day)
            day += dt.timedelta(days=1)

    candidates, guides_by_id = load_guides(db, segment.start_date, segment.end_date)
    results, _ = match_guides(needs, request, candidates)
    plan = plan_coverage(request, results, skip_days=taken)

    return CoveragePlanResponse(
        segment_id=segment.id,
        single_guide=plan.single_guide,
        total_price=plan.total_price,
        uncovered_days=plan.uncovered_days,
        blocks=[
            CoverageBlockRead(
                start_date=b.start_date,
                end_date=b.end_date,
                days=(b.end_date - b.start_date).days + 1,
                options=[
                    CoverageOptionRead(
                        guide=summary(*guides_by_id[o.guide.id]),
                        total_score=o.score,
                        price=o.price,
                    )
                    for o in b.options
                ],
            )
            for b in plan.blocks
        ],
    )

def segment_taken_days(db: Session, segment: TripSegment) -> set[dt.date]:
    """Days of this segment that an active booking (requested or later) already covers."""
    taken: set[dt.date] = set()
    active = (BookingStatus.REQUESTED, *BLOCKING_STATUSES)
    for b in db.scalars(
        select(Booking).where(Booking.segment_id == segment.id, Booking.status.in_(active))
    ):
        day = b.start_date
        while day <= b.end_date:
            taken.add(day)
            day += dt.timedelta(days=1)
    return taken


@router.get("/segments/{segment_id}/connecting-options", response_model=ConnectingOptionsResponse)
def segment_connecting_options(
    segment_id: int, user: User = Depends(require_tourist), db: Session = Depends(get_db)
):
    """Like transit flights: ways to share a multi-day segment between several guides.

    Guides free on every day are the direct options in /trips/{trip_id}/matches and are
    not repeated here. Show these below them. Each leg is booked on its own with
    POST /bookings (segment_id, guide_id, start_date, end_date).
    """
    tourist = get_tourist(db, user)
    segment = db.get(TripSegment, segment_id)
    if segment is None or db.get(Trip, segment.trip_id).tourist_id != tourist.id:
        raise HTTPException(status_code=404, detail="Trip segment not found")
    if segment.service_type == ServiceType.MICRO or segment.start_date == segment.end_date:
        return ConnectingOptionsResponse(segment_id=segment.id, options=[])

    needs = TouristNeeds(
        preferred_language=tourist.preferred_language.value,
        languages=tourist.languages,
        mobility_level=tourist.mobility_level,
        gender_preference=tourist.gender_preference,
    )
    request = to_segment_request(segment)
    candidates, guides_by_id = load_guides(db, segment.start_date, segment.end_date)
    results, _ = match_guides(needs, request, candidates)
    plans = connecting_options(needs, request, results, skip_days=segment_taken_days(db, segment))

    def leg_read(leg) -> dict:
        return dict(
            guide=summary(*guides_by_id[leg.guide.id]),
            start_date=leg.start_date,
            end_date=leg.end_date,
            days=leg.days,
            total_score=leg.score,
            price=leg.price,
        )

    return ConnectingOptionsResponse(
        segment_id=segment.id,
        options=[
            ConnectingPlanRead(
                changes=p.changes,
                uncovered_days=p.uncovered_days,
                average_score=p.average_score,
                total_price=p.total_price,
                legs=[
                    ConnectingLegWithAlternatives(
                        **leg_read(leg),
                        alternatives=[ConnectingLegRead(**leg_read(a)) for a in leg.alternatives],
                    )
                    for leg in p.legs
                ],
            )
            for p in plans
        ],
    )

@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, user: User = Depends(require_tourist), db: Session = Depends(get_db)):
    """Delete your own trip, once none of its bookings is still active. Its segments, its bookings
    that are finished or never happened (including ones whose dates passed unconfirmed) and their
    itineraries go with it."""
    tourist = get_tourist(db, user)
    trip = get_own_trip(db, tourist, trip_id)
    bookings = [tuple(row) for row in db.execute(
        select(Booking.status, Booking.end_date).join(TripSegment, TripSegment.id == Booking.segment_id).where(TripSegment.trip_id == trip.id)
    )]
    problem = trip_delete_problem(bookings, dt.date.today())
    if problem:
        raise HTTPException(status_code=409, detail=problem)
    db.delete(trip)  # the database cascades to segments, bookings, itineraries and their stops
    db.commit()
