"""When a trip or a booking may be deleted. No database needed, so they can be tested on their own."""

import datetime as dt

from app.enums import BookingStatus

# Still going ahead: these have to be cancelled before anything is deleted
ACTIVE = (
    BookingStatus.REQUESTED,
    BookingStatus.ACCEPTED,
    BookingStatus.ITINERARY_DRAFT,
    BookingStatus.IN_REVIEW,
    BookingStatus.CONFIRMED,
)
# Bookings that never happened can be deleted
DELETABLE_BOOKING = (BookingStatus.DECLINED, BookingStatus.CANCELLED)
# A booking whose dates have passed while it was still in one of these never became a confirmed
# tour. It can't be cancelled any more (that needs the booking not to have ended), so it can be
# deleted instead; otherwise it would be stuck, and would block deleting its trip.
NEVER_CONFIRMED = (
    BookingStatus.REQUESTED,
    BookingStatus.ACCEPTED,
    BookingStatus.ITINERARY_DRAFT,
    BookingStatus.IN_REVIEW,
)


def ended_unconfirmed(status: BookingStatus, end_date: dt.date, today: dt.date) -> bool:
    return status in NEVER_CONFIRMED and end_date < today


def trip_delete_problem(bookings: list[tuple[BookingStatus, dt.date]], today: dt.date) -> str | None:
    """None when the trip can go; its bookings that are finished or never happened, and their
    itineraries, go with it. `bookings` are (status, end date) pairs."""
    active = sum(1 for status, end in bookings if status in ACTIVE and not ended_unconfirmed(status, end, today))
    if active:
        return f"This trip still has {active} active booking(s). Cancel them first."
    return None


def booking_delete_problem(status: BookingStatus, end_date: dt.date, today: dt.date) -> str | None:
    if status in DELETABLE_BOOKING or ended_unconfirmed(status, end_date, today):
        return None
    if status == BookingStatus.COMPLETED:
        return "A completed booking is kept as a record of the tour"
    if status == BookingStatus.CONFIRMED:
        return "A confirmed tour is kept. Cancel it, or the guide marks it completed after its last day."
    return f"Only a cancelled or declined booking can be deleted (this one is {status.value}). Cancel it first."
