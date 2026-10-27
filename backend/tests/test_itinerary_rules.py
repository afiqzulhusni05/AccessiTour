"""Tests for the itinerary rules that don't need the database.

Run from the backend folder:  pytest -v
"""

import datetime as dt

from app.enums import BookingStatus
from app.itinerary_rules import date_problem, status_for_approvals, time_problem


def test_booking_status_follows_the_approvals():
    assert status_for_approvals(False, False) == BookingStatus.ITINERARY_DRAFT
    assert status_for_approvals(True, False) == BookingStatus.IN_REVIEW
    assert status_for_approvals(False, True) == BookingStatus.IN_REVIEW
    assert status_for_approvals(True, True) == BookingStatus.CONFIRMED


def test_a_stop_must_fall_inside_the_booking():
    start, end = dt.date(2026, 11, 5), dt.date(2026, 11, 7)
    assert date_problem(dt.date(2026, 11, 5), start, end) is None
    assert date_problem(dt.date(2026, 11, 7), start, end) is None
    assert date_problem(dt.date(2026, 11, 4), start, end) is not None
    assert date_problem(dt.date(2026, 11, 8), start, end) is not None


def test_a_stop_cannot_end_before_it_starts():
    assert time_problem(dt.time(10), dt.time(10)) is None  # no length set
    assert time_problem(dt.time(10), dt.time(11, 30)) is None
    assert time_problem(dt.time(11), dt.time(10)) is not None
