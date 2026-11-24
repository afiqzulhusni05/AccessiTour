"""When a trip or a booking may be deleted. No database needed, so they can be tested on their own."""

from app.enums import BookingStatus

# Still going ahead: these have to be cancelled before anything is deleted
ACTIVE = (
    BookingStatus.REQUESTED,
    BookingStatus.ACCEPTED,
    BookingStatus.ITINERARY_DRAFT,
    BookingStatus.IN_REVIEW,
    BookingStatus.CONFIRMED,
)
# A finished tour stays as a record, so only bookings that never happened can be deleted
DELETABLE_BOOKING = (BookingStatus.DECLINED, BookingStatus.CANCELLED)


def trip_delete_problem(booking_statuses: list[BookingStatus]) -> str | None:
    """None when the trip can go; its non-active bookings and their itineraries go with it."""
    active = sum(1 for s in booking_statuses if s in ACTIVE)
    if active:
        return f"This trip still has {active} active booking(s). Cancel them first."
    return None


def booking_delete_problem(status: BookingStatus) -> str | None:
    if status in DELETABLE_BOOKING:
        return None
    if status == BookingStatus.COMPLETED:
        return "A completed booking is kept as a record of the tour"
    return f"Only a cancelled or declined booking can be deleted (this one is {status.value}). Cancel it first."
