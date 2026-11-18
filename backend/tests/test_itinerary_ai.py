"""Tests for turning the AI's stops into itinerary items (no AI call, no database).

Run from the backend folder:  pytest -v
"""

import datetime as dt
from types import SimpleNamespace

import pytest

from app.itinerary_ai import ai_request, engines_to_try, take_turns, call_with_retries, extra_requests, parse_stops

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


def test_the_ai_request_is_plain_values():
    """Plain values, so nothing has to be read from the database during the AI call."""
    enum = lambda v: SimpleNamespace(value=v)
    segment = SimpleNamespace(region=enum("BUSAN"), group_size=2, transport_preference=enum("PUBLIC"),
                              attributes=["FOOD"], budget=150000)
    booking = SimpleNamespace(start_date=NOV_10, end_date=NOV_10, service_type=enum("FULL_DAY"),
                              start_time=None, end_time=None)
    tourist = SimpleNamespace(preferred_language=enum("en"), mobility_level=enum("SLOW_WALK"), dietary=["HALAL"],
                              dietary_notes=None, special_requests=None, religious_needs=None)
    guide = SimpleNamespace(languages=["en", "ko"])
    request = ai_request(segment, booking, tourist, guide)
    assert request["region"] == "BUSAN" and request["start_date"] == "2026-11-10"
    assert request["start_time"] is None and request["mobility_level"] == "SLOW_WALK"
    assert request["guide_languages"] == ["en", "ko"]


def test_models_take_turns_so_a_busy_one_is_not_tried_twice_in_a_row():
    next_model = take_turns(["main", "backup"])
    assert [next_model() for _ in range(5)] == ["main", "backup", "main", "backup", "main"]


def test_with_one_model_every_try_uses_it():
    next_model = take_turns(["main"])
    assert [next_model() for _ in range(3)] == ["main", "main", "main"]


def settings_with(**values):
    base = dict(gemini_model="gemini-main", gemini_fallback_model=None, openai_api_key=None, openai_model=None)
    base.update(values)
    return SimpleNamespace(**base)


def test_only_gemini_when_nothing_else_is_set_up():
    assert engines_to_try(settings_with()) == [("gemini", "gemini-main")]


def test_openai_is_added_only_with_a_key_and_a_model():
    assert engines_to_try(settings_with(openai_model="gpt-x")) == [("gemini", "gemini-main")]
    assert engines_to_try(settings_with(openai_api_key="k", openai_model="gpt-x")) == [
        ("gemini", "gemini-main"),
        ("openai", "gpt-x"),
    ]


def test_all_three_take_turns():
    engines = engines_to_try(settings_with(gemini_fallback_model="gemini-b", openai_api_key="k", openai_model="gpt-x"))
    next_engine = take_turns(engines)
    assert [next_engine()[0] for _ in range(4)] == ["gemini", "gemini", "openai", "gemini"]
