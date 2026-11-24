"""Tests for when trips and bookings may be deleted.

Run from the backend folder:  pytest -v
"""

from app.deletion_rules import booking_delete_problem, trip_delete_problem
from app.enums import BookingStatus as S


def test_a_trip_with_no_bookings_or_only_finished_ones_can_be_deleted():
    assert trip_delete_problem([]) is None
    assert trip_delete_problem([S.DECLINED, S.CANCELLED, S.COMPLETED]) is None


def test_a_trip_with_an_active_booking_cannot_be_deleted():
    for status in (S.REQUESTED, S.ACCEPTED, S.ITINERARY_DRAFT, S.IN_REVIEW, S.CONFIRMED):
        assert trip_delete_problem([S.CANCELLED, status]) is not None


def test_only_bookings_that_never_happened_can_be_deleted():
    assert booking_delete_problem(S.DECLINED) is None
    assert booking_delete_problem(S.CANCELLED) is None
    for status in (S.REQUESTED, S.ACCEPTED, S.CONFIRMED, S.COMPLETED):
        assert booking_delete_problem(status) is not None
