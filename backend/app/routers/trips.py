import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_tourist
from app.matching import SegmentRequest, TouristNeeds, combine_whole_trip, match_guides
from app.models import Tourist, Trip, TripSegment, User
from app.routers.matching import load_guides, summary
from app.schemas.matching import ExcludedItem, FactorScoreRead, MatchItem
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