"""Tests for when trips and bookings may be deleted.

Run from the backend folder:  pytest -v
"""

import datetime as dt

from app.deletion_rules import booking_delete_problem, trip_delete_problem
from app.enums import BookingStatus as S

TODAY = dt.date(2026, 11, 24)
PAST = dt.date(2026, 10, 30)
FUTURE = dt.date(2026, 12, 5)


def test_a_trip_with_no_bookings_or_only_finished_ones_can_be_deleted():
    assert trip_delete_problem([], TODAY) is None
    assert trip_delete_problem([(S.DECLINED, FUTURE), (S.CANCELLED, FUTURE), (S.COMPLETED, PAST)], TODAY) is None


def test_a_trip_with_an_active_booking_cannot_be_deleted():
    for status in (S.REQUESTED, S.ACCEPTED, S.ITINERARY_DRAFT, S.IN_REVIEW, S.CONFIRMED):
        assert trip_delete_problem([(S.CANCELLED, FUTURE), (status, FUTURE)], TODAY) is not None


def test_a_trip_whose_booking_ended_without_being_confirmed_can_be_deleted():
    for status in (S.REQUESTED, S.ACCEPTED, S.ITINERARY_DRAFT, S.IN_REVIEW):
        assert trip_delete_problem([(status, PAST)], TODAY) is None
    assert trip_delete_problem([(S.CONFIRMED, PAST)], TODAY) is not None  # the guide completes it instead


def test_only_bookings_that_never_happened_can_be_deleted():
    assert booking_delete_problem(S.DECLINED, FUTURE, TODAY) is None
    assert booking_delete_problem(S.CANCELLED, FUTURE, TODAY) is None
    for status in (S.REQUESTED, S.ACCEPTED, S.CONFIRMED, S.COMPLETED):
        assert booking_delete_problem(status, FUTURE, TODAY) is not None


def test_a_booking_that_ended_without_being_confirmed_can_be_deleted():
    for status in (S.REQUESTED, S.ACCEPTED, S.ITINERARY_DRAFT, S.IN_REVIEW):
        assert booking_delete_problem(status, PAST, TODAY) is None
    assert booking_delete_problem(S.ACCEPTED, TODAY, TODAY) is not None  # still on its last day
    assert booking_delete_problem(S.CONFIRMED, PAST, TODAY) is not None
    assert booking_delete_problem(S.COMPLETED, PAST, TODAY) is not None
