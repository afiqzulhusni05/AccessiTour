import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_guide, require_tourist
from app.enums import BookingStatus
from app.matching import bookings_overlap, estimate_price, exclusion_reason, free_days
from app.models import Booking, Guide, Tourist, Trip, TripSegment, User
from app.routers.matching import BLOCKING_STATUSES, load_guides, summary
from app.routers.trips import get_tourist, to_segment_request
from app.schemas.booking import BookingCreate, BookingRead, TouristBrief

router = APIRouter(prefix="/api/v1/bookings", tags=["bookings"])

# A booking in any of these statuses is still going ahead
ACTIVE_STATUSES = (BookingStatus.REQUESTED, *BLOCKING_STATUSES)


# ---------- Helpers ----------


def get_guide(db: Session, user: User) -> Guide:
    guide = db.scalar(select(Guide).where(Guide.user_id == user.id))
    if guide is None:
        raise HTTPException(status_code=400, detail="Create your guide profile first")
    return guide


def to_read(db: Session, booking: Booking) -> BookingRead:
    segment = db.get(TripSegment, booking.segment_id)
    trip = db.get(Trip, segment.trip_id)
    tourist = db.get(Tourist, trip.tourist_id)
    tourist_user = db.get(User, tourist.user_id)
    guide = db.get(Guide, booking.guide_id)
    guide_user = db.get(User, guide.user_id)
    return BookingRead(
        id=booking.id,
        status=booking.status,
        trip_id=trip.id,
        segment_id=segment.id,
        region=segment.region,
        service_type=booking.service_type,
        start_date=booking.start_date,
        end_date=booking.end_date,
        start_time=booking.start_time,
        end_time=booking.end_time,
        group_size=segment.group_size,
        total_price=booking.total_price,
        guide=summary(guide, guide_user),
        tourist=TouristBrief(
            id=tourist.id,
            full_name=tourist_user.full_name,
            nationality=tourist.nationality,
            preferred_language=tourist.preferred_language,
            mobility_level=tourist.mobility_level,
        ),
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


def tourist_id_of(db: Session, booking: Booking) -> int:
    segment = db.get(TripSegment, booking.segment_id)
    return db.get(Trip, segment.trip_id).tourist_id


def get_my_booking(db: Session, user: User, booking_id: int) -> Booking:
    """A booking the user is part of, as its tourist or its guide.
    Anyone else gets 404, the same as a missing booking."""
    booking = db.get(Booking, booking_id)
    if booking is not None:
        tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
        guide = db.scalar(select(Guide).where(Guide.user_id == user.id))
        if (tourist and tourist_id_of(db, booking) == tourist.id) or (
            guide and booking.guide_id == guide.id
        ):
            return booking
    raise HTTPException(status_code=404, detail="Booking not found")


def get_guide_booking(db: Session, user: User, booking_id: int) -> Booking:
    guide = get_guide(db, user)
    booking = db.get(Booking, booking_id)
    if booking is None or booking.guide_id != guide.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def require_status(booking: Booking, allowed: tuple, action: str):
    if booking.status not in allowed:
        names = " or ".join(s.value for s in allowed)
        raise HTTPException(
            status_code=409,
            detail=f"Only a {names} booking can be {action} (this one is {booking.status.value})",
        )


def save(db: Session, booking: Booking, status: BookingStatus) -> BookingRead:
    booking.status = status
    db.commit()
    db.refresh(booking)
    return to_read(db, booking)


# ---------- Endpoints ----------


@router.post("", response_model=BookingRead, status_code=201)
def create_booking(
    data: BookingCreate,
    user: User = Depends(require_tourist),
    db: Session = Depends(get_db),
):
    """Ask a guide to take one part (segment) of your trip."""
    tourist = get_tourist(db, user)

    segment = db.get(TripSegment, data.segment_id)
    if segment is None or db.get(Trip, segment.trip_id).tourist_id != tourist.id:
        raise HTTPException(status_code=404, detail="Trip segment not found")
    if segment.start_date < dt.date.today():
        raise HTTPException(status_code=400, detail="This part of your trip has already started")

    existing = db.scalar(
        select(Booking).where(
            Booking.segment_id == segment.id, Booking.status.in_(ACTIVE_STATUSES)
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"This part of your trip already has booking {existing.id} "
            f"({existing.status.value}). Cancel it before booking another guide.",
        )

    candidates, guides_by_id = load_guides(
        db, segment.start_date, segment.end_date, guide_ids=[data.guide_id]
    )
    if not candidates:
        raise HTTPException(status_code=404, detail="Guide not found")
    candidate = candidates[0]

    # Same checks as matching, so the guide must be one matching would show
    request = to_segment_request(segment)
    reason = exclusion_reason(candidate, request)
    if reason is not None:
        raise HTTPException(
            status_code=409, detail=f"Can't book {candidate.full_name}: {reason}"
        )
    # Matching allows a guide who is free on only some days; a booking needs all of them
    free = set(free_days(candidate, request))
    missing = [day for day in request.days() if day not in free]
    if missing:
        days = ", ".join(f"{day:%d %b}" for day in missing)
        raise HTTPException(
            status_code=409, detail=f"Can't book {candidate.full_name}: not free on {days}"
        )

    booking = Booking(
        segment_id=segment.id,
        guide_id=candidate.id,
        service_type=segment.service_type,
        start_date=segment.start_date,
        end_date=segment.end_date,
        start_time=segment.start_time,
        end_time=segment.end_time,
        # Copied now so later changes to the guide's rates don't change this booking
        total_price=estimate_price(candidate.services[segment.service_type], request),
        status=BookingStatus.REQUESTED,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return to_read(db, booking)


@router.get("/me", response_model=list[BookingRead])
def list_my_bookings(
    status: BookingStatus | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A tourist sees the bookings they made; a guide sees the bookings made with them."""
    query = select(Booking)
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    guide = db.scalar(select(Guide).where(Guide.user_id == user.id))
    if tourist is not None:
        query = (
            query.join(TripSegment, TripSegment.id == Booking.segment_id)
            .join(Trip, Trip.id == TripSegment.trip_id)
            .where(Trip.tourist_id == tourist.id)
        )
    elif guide is not None:
        query = query.where(Booking.guide_id == guide.id)
    else:
        raise HTTPException(status_code=400, detail="Create your profile first")

    if status is not None:
        query = query.where(Booking.status == status)
    query = query.order_by(Booking.start_date, Booking.start_time, Booking.id)
    return [to_read(db, booking) for booking in db.scalars(query)]


@router.get("/{booking_id}", response_model=BookingRead)
def read_booking(
    booking_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return to_read(db, get_my_booking(db, user, booking_id))


@router.post("/{booking_id}/accept", response_model=BookingRead)
def accept_booking(
    booking_id: int, user: User = Depends(require_guide), db: Session = Depends(get_db)
):
    booking = get_guide_booking(db, user, booking_id)
    require_status(booking, (BookingStatus.REQUESTED,), "accepted")
    if booking.start_date < dt.date.today():
        raise HTTPException(status_code=409, detail="This booking's date has already passed")

    # No double booking: the guide can't hold two bookings at the same time
    others = db.scalars(
        select(Booking).where(
            Booking.guide_id == booking.guide_id,
            Booking.id != booking.id,
            Booking.status.in_(BLOCKING_STATUSES),
            Booking.start_date <= booking.end_date,
            Booking.end_date >= booking.start_date,
        )
    )
    for other in others:
        if bookings_overlap(booking, other):
            raise HTTPException(
                status_code=409,
                detail=f"You already have booking {other.id} at that time",
            )
    return save(db, booking, BookingStatus.ACCEPTED)


@router.post("/{booking_id}/decline", response_model=BookingRead)
def decline_booking(
    booking_id: int, user: User = Depends(require_guide), db: Session = Depends(get_db)
):
    booking = get_guide_booking(db, user, booking_id)
    require_status(booking, (BookingStatus.REQUESTED,), "declined")
    return save(db, booking, BookingStatus.DECLINED)


@router.post("/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(
    booking_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """The tourist or the guide can cancel, any time before the booking ends."""
    booking = get_my_booking(db, user, booking_id)
    require_status(booking, ACTIVE_STATUSES, "cancelled")
    if booking.end_date < dt.date.today():
        raise HTTPException(status_code=409, detail="This booking has already ended")
    return save(db, booking, BookingStatus.CANCELLED)


@router.post("/{booking_id}/complete", response_model=BookingRead)
def complete_booking(
    booking_id: int, user: User = Depends(require_guide), db: Session = Depends(get_db)
):
    """The guide marks a confirmed booking as done, on or after its last day."""
    booking = get_guide_booking(db, user, booking_id)
    require_status(booking, (BookingStatus.CONFIRMED,), "completed")
    if booking.end_date > dt.date.today():
        raise HTTPException(
            status_code=409, detail="A booking can be completed on or after its last day"
        )
    return save(db, booking, BookingStatus.COMPLETED)
