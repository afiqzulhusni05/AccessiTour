"""Rules for itineraries that don't need the database, so they can be tested on their own."""

import datetime as dt

from app.enums import BookingStatus

# A booking in one of these states has (or may get) an itinerary
HAS_ITINERARY = (
    BookingStatus.ACCEPTED,
    BookingStatus.ITINERARY_DRAFT,
    BookingStatus.IN_REVIEW,
    BookingStatus.CONFIRMED,
    BookingStatus.COMPLETED,
)
# While the plan is being agreed, the booking's status follows the approvals
PLANNING = (BookingStatus.ACCEPTED, BookingStatus.ITINERARY_DRAFT, BookingStatus.IN_REVIEW, BookingStatus.CONFIRMED)


def status_for_approvals(by_tourist: bool, by_guide: bool) -> BookingStatus:
    """Nobody has approved: a draft. One side has: in review. Both have: confirmed."""
    if by_tourist and by_guide:
        return BookingStatus.CONFIRMED
    if by_tourist or by_guide:
        return BookingStatus.IN_REVIEW
    return BookingStatus.ITINERARY_DRAFT


def date_problem(day: dt.date, start: dt.date, end: dt.date) -> str | None:
    if day < start or day > end:
        return f"The date must be between {start} and {end}"
    return None


def time_problem(start: dt.time, end: dt.time) -> str | None:
    if end < start:
        return "end_time cannot be before start_time"
    return None
