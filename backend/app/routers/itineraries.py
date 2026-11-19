"""The itinerary for a booking: stops, comments, approvals and progress during the trip.

The tourist and the guide of a booking can both read and edit it; anyone else gets
404, the same as a missing itinerary. Changing a stop withdraws both approvals,
because they only covered the plan as it was. Marking progress is not a change
to the plan, so it keeps them.
"""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.enums import BookingStatus, EditedBy, MobilityLevel
from app.itinerary_rules import HAS_ITINERARY, PLANNING, date_problem, status_for_approvals, time_problem
from app.models import Booking, Guide, Itinerary, ItineraryComment, ItineraryItem, Tourist, Trip, TripSegment, User, UserRole
from app.routers.bookings import get_my_booking, to_read
from app.schemas.itineraries import (
    CommentCreate,
    CommentRead,
    ItemIn,
    ItemRead,
    ItemUpdate,
    ItineraryCreate,
    ItineraryRead,
    ItinerarySummary,
    ProgressUpdate,
)

router = APIRouter(prefix="/api/v1/itineraries", tags=["itineraries"])


# ---------- Helpers ----------


def side(user: User) -> str:
    return "TOURIST" if user.role == UserRole.TOURIST else "GUIDE"


def get_my_itinerary(db: Session, user: User, itinerary_id: int) -> tuple[Itinerary, Booking]:
    itinerary = db.get(Itinerary, itinerary_id)
    if itinerary is None:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    booking = get_my_booking(db, user, itinerary.booking_id)  # 404 unless the user is its tourist or guide
    return itinerary, booking


def get_item(db: Session, itinerary: Itinerary, item_id: int) -> ItineraryItem:
    item = db.get(ItineraryItem, item_id)
    if item is None or item.itinerary_id != itinerary.id:
        raise HTTPException(status_code=404, detail="Stop not found")
    return item


def check_editable(booking: Booking):
    if booking.status not in PLANNING:
        raise HTTPException(status_code=409, detail=f"This booking is {booking.status.value}, so its plan can't change")


def plan_changed(itinerary: Itinerary, booking: Booking):
    """Approvals only cover the plan as it was."""
    itinerary.approved_by_tourist = itinerary.approved_by_guide = False
    booking.status = BookingStatus.ITINERARY_DRAFT


def read(db: Session, itinerary: Itinerary, booking: Booking, user: User) -> ItineraryRead:
    b = to_read(db, booking)
    items = db.scalars(
        select(ItineraryItem)
        .where(ItineraryItem.itinerary_id == itinerary.id)
        .order_by(ItineraryItem.date, ItineraryItem.start_time, ItineraryItem.id)
    )
    comments = db.execute(
        select(ItineraryComment, User)
        .join(User, User.id == ItineraryComment.author_id)
        .where(ItineraryComment.itinerary_id == itinerary.id)
        .order_by(ItineraryComment.created_at, ItineraryComment.id)
    ).all()
    return ItineraryRead(
        id=itinerary.id, booking_id=booking.id, booking_status=booking.status, trip_id=b.trip_id, region=b.region,
        start_date=b.start_date, end_date=b.end_date, group_size=b.group_size, tourist=b.tourist, guide=b.guide,
        you_are=side(user), accessibility_review=itinerary.needs_accessibility_check,
        approved_by_tourist=itinerary.approved_by_tourist, approved_by_guide=itinerary.approved_by_guide,
        items=[ItemRead.model_validate(i, from_attributes=True) for i in items],
        comments=[
            CommentRead(id=c.id, item_id=c.item_id, author=side(u), author_name=u.full_name, body=c.body, created_at=c.created_at)
            for c, u in comments
        ],
    )


# ---------- Endpoints ----------


@router.get("", response_model=list[ItinerarySummary])
def list_my_itineraries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A tourist's itineraries, or the itineraries of a guide's bookings."""
    query = (
        select(Itinerary, Booking)
        .join(Booking, Booking.id == Itinerary.booking_id)
        .join(TripSegment, TripSegment.id == Booking.segment_id)
        .join(Trip, Trip.id == TripSegment.trip_id)
    )
    tourist = db.scalar(select(Tourist).where(Tourist.user_id == user.id))
    guide = db.scalar(select(Guide).where(Guide.user_id == user.id))
    if tourist is not None:
        query = query.where(Trip.tourist_id == tourist.id)
    elif guide is not None:
        query = query.where(Booking.guide_id == guide.id)
    else:
        return []
    out = []
    for itinerary, booking in db.execute(query.order_by(Booking.start_date.desc())).all():
        b = to_read(db, booking)
        stops = db.query(ItineraryItem).filter(ItineraryItem.itinerary_id == itinerary.id).count()
        out.append(ItinerarySummary(
            id=itinerary.id, booking_id=booking.id, trip_id=b.trip_id, region=b.region,
            start_date=b.start_date, end_date=b.end_date, tourist_name=b.tourist.full_name, guide_name=b.guide.full_name,
            stops=stops, approved_by_tourist=itinerary.approved_by_tourist, approved_by_guide=itinerary.approved_by_guide,
        ))
    return out


@router.post("", response_model=ItineraryRead)
def open_itinerary(data: ItineraryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The itinerary for an accepted booking, created empty the first time either side opens it.
    (When the AI service is merged, it can fill in the first draft here.)"""
    booking = get_my_booking(db, user, data.booking_id)
    itinerary = db.scalar(select(Itinerary).where(Itinerary.booking_id == booking.id))
    if itinerary is None:
        if booking.status not in HAS_ITINERARY:
            raise HTTPException(status_code=409, detail="The guide hasn't accepted this booking yet")
        tourist = db.get(Tourist, db.get(Trip, db.get(TripSegment, booking.segment_id).trip_id).tourist_id)
        itinerary = Itinerary(
            booking_id=booking.id,
            needs_accessibility_check=tourist.mobility_level != MobilityLevel.NORMAL,
            approved_by_tourist=False, approved_by_guide=False,
        )
        db.add(itinerary)
        if booking.status == BookingStatus.ACCEPTED:
            booking.status = BookingStatus.ITINERARY_DRAFT
        db.commit()
        db.refresh(itinerary)
    return read(db, itinerary, booking, user)


@router.get("/{itinerary_id}", response_model=ItineraryRead)
def read_itinerary(itinerary_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    return read(db, itinerary, booking, user)


@router.post("/{itinerary_id}/items", response_model=ItineraryRead, status_code=201)
def add_item(itinerary_id: int, data: ItemIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    check_editable(booking)
    problem = date_problem(data.date, booking.start_date, booking.end_date)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    db.add(ItineraryItem(
        itinerary_id=itinerary.id, **data.model_dump(),
        edited_by=EditedBy(side(user)),
        # a stop the tourist adds needs the guide's on-site check when the tourist has mobility needs
        needs_accessibility_check=itinerary.needs_accessibility_check and user.role == UserRole.TOURIST,
    ))
    plan_changed(itinerary, booking)
    db.commit()
    return read(db, itinerary, booking, user)


@router.patch("/{itinerary_id}/items/{item_id}", response_model=ItineraryRead)
def update_item(
    itinerary_id: int, item_id: int, data: ItemUpdate,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    check_editable(booking)
    item = get_item(db, itinerary, item_id)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(item, key, value)
    if "place_name" in changes and not {"latitude", "longitude"} & changes.keys():
        item.latitude = item.longitude = None  # renamed without a new position: the old pin would be wrong
    problem = date_problem(item.date, booking.start_date, booking.end_date) or time_problem(item.start_time, item.end_time)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if changes:
        item.edited_by = EditedBy(side(user))
        if "place_name" in changes and itinerary.needs_accessibility_check and user.role == UserRole.TOURIST:
            item.needs_accessibility_check = True
        plan_changed(itinerary, booking)
    db.commit()
    return read(db, itinerary, booking, user)


@router.delete("/{itinerary_id}/items/{item_id}", response_model=ItineraryRead)
def delete_item(itinerary_id: int, item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    check_editable(booking)
    db.delete(get_item(db, itinerary, item_id))
    plan_changed(itinerary, booking)
    db.commit()
    return read(db, itinerary, booking, user)


@router.put("/{itinerary_id}/items/{item_id}/progress", response_model=ItineraryRead)
def set_progress(
    itinerary_id: int, item_id: int, data: ProgressUpdate,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Where the tourist is with one stop. Not a change to the plan, so approvals stay."""
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    item = get_item(db, itinerary, item_id)
    if data.progress == "ON_THE_WAY":  # you can only be heading to one place
        for other in db.scalars(select(ItineraryItem).where(
            ItineraryItem.itinerary_id == itinerary.id, ItineraryItem.progress == "ON_THE_WAY"
        )):
            other.progress = "UPCOMING"
    item.progress = data.progress
    db.commit()
    return read(db, itinerary, booking, user)


@router.post("/{itinerary_id}/items/{item_id}/check", response_model=ItineraryRead)
def confirm_accessibility(
    itinerary_id: int, item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """The guide confirms a stop works for how the tourist gets around."""
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    if user.role != UserRole.GUIDE:
        raise HTTPException(status_code=403, detail="Only the guide can confirm accessibility")
    get_item(db, itinerary, item_id).needs_accessibility_check = False
    db.commit()
    return read(db, itinerary, booking, user)


@router.post("/{itinerary_id}/comments", response_model=ItineraryRead, status_code=201)
def add_comment(
    itinerary_id: int, data: CommentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """A comment on one stop, or (without item_id) a message about the whole itinerary."""
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    if data.item_id is not None:
        get_item(db, itinerary, data.item_id)
    db.add(ItineraryComment(itinerary_id=itinerary.id, item_id=data.item_id, author_id=user.id, body=data.body))
    db.commit()
    return read(db, itinerary, booking, user)


@router.post("/{itinerary_id}/approve", response_model=ItineraryRead)
def approve(itinerary_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Each side approves the plan as it is. When both have, the booking is confirmed."""
    itinerary, booking = get_my_itinerary(db, user, itinerary_id)
    check_editable(booking)
    if user.role == UserRole.GUIDE:
        open_checks = db.scalar(select(ItineraryItem.id).where(
            ItineraryItem.itinerary_id == itinerary.id, ItineraryItem.needs_accessibility_check.is_(True)
        ))
        if open_checks is not None:
            raise HTTPException(status_code=409, detail="Some stops still need your accessibility check")
        itinerary.approved_by_guide = True
    else:
        itinerary.approved_by_tourist = True
    booking.status = status_for_approvals(itinerary.approved_by_tourist, itinerary.approved_by_guide)
    db.commit()
    return read(db, itinerary, booking, user)
