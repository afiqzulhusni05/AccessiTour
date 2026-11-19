"""Tests for turning the AI's stops into itinerary items (no AI call, no database).

Run from the backend folder:  pytest -v
"""

import datetime as dt
from types import SimpleNamespace

import pytest

from app.itinerary_ai import call_with_retries, extra_requests, parse_stops

NOV_10 = dt.date(2026, 11, 10)
NOV_11 = dt.date(2026, 11, 11)


def stop(date="2026-11-10", start="10:00", end="11:30", place="Busan Museum", **more):
    values = dict(date=date, start_time=start, end_time=end, place_name=place, activity="Look around",
                  latitude=35.13, longitude=129.10)
    values.update(more)
    return SimpleNamespace(**values)


def test_a_normal_stop_becomes_an_item():
    [item] = parse_stops([stop()], NOV_10, NOV_10)
    assert item["date"] == NOV_10
    assert item["start_time"] == dt.time(10) and item["end_time"] == dt.time(11, 30)
    assert item["place_name"] == "Busan Museum"
    assert item["latitude"] == 35.13


def test_stops_outside_the_booking_are_left_out():
    stops = [stop(date="2026-11-09"), stop(date="2026-11-10"), stop(date="2026-11-11"), stop(date="2026-11-12")]
    assert [i["date"] for i in parse_stops(stops, NOV_10, NOV_11)] == [NOV_10, NOV_11]


def test_unreadable_dates_times_and_empty_places_are_left_out():
    stops = [stop(date="10 Nov"), stop(start="morning"), stop(end=None), stop(place="  "), stop()]
    assert len(parse_stops(stops, NOV_10, NOV_10)) == 1


def test_a_stop_ending_before_it_starts_gets_no_length():
    [item] = parse_stops([stop(start="15:00", end="14:00")], NOV_10, NOV_10)
    assert item["end_time"] == dt.time(15)


def test_stops_without_coordinates_are_kept():
    [item] = parse_stops([stop(latitude=None, longitude=None)], NOV_10, NOV_10)
    assert item["latitude"] is None


def test_religious_needs_are_sent_with_special_requests():
    tourist = SimpleNamespace(special_requests="Quiet places", religious_needs="Prayer breaks at noon")
    assert extra_requests(tourist) == "Quiet places; Religious needs: Prayer breaks at noon"
    assert extra_requests(SimpleNamespace(special_requests=None, religious_needs=None)) is None


def flaky(failures, error=RuntimeError("high demand")):
    """A function that fails `failures` times, then returns "ok"."""
    calls = []

    def fn():
        calls.append(1)
        if len(calls) <= failures:
            raise error
        return "ok"

    return fn, calls


def test_a_busy_ai_is_tried_again():
    fn, calls = flaky(2)
    waited = []
    assert call_with_retries(fn, waits=(10, 30, 60), sleep=waited.append) == "ok"
    assert len(calls) == 3 and waited == [10, 30]


def test_it_gives_up_after_the_last_try():
    fn, calls = flaky(10)
    waited = []
    with pytest.raises(RuntimeError):
        call_with_retries(fn, waits=(10, 30), sleep=waited.append)
    assert len(calls) == 3 and waited == [10, 30]


def test_a_wrong_request_is_not_retried():
    fn, calls = flaky(1, error=ValueError("MICRO needs times"))
    with pytest.raises(ValueError):
        call_with_retries(fn, waits=(10,), sleep=lambda s: None)
    assert len(calls) == 1
