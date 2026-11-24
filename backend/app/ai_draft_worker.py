"""Fills a new itinerary with the AI's first draft.

When a booking's itinerary is opened for the first time, the router creates it
empty, answers straight away, and runs fill_with_ai_draft() in the background.
The stops appear a little later (the itinerary page refreshes itself), written
by the AI, for the tourist and guide to edit and approve.

If the AI isn't set up, is slow or fails, the itinerary simply stays empty and
both sides add stops themselves, as before.
"""

import datetime as dt
import logging
import time

logger = logging.getLogger(__name__)

# If the AI fails, wait and try again: the first try plus 3 retries, waiting
# 10, 30 and 60 seconds between them. Each retry runs the whole AI generation
# again, starting with GPT-6 Luna and falling back to Gemini if Luna fails.
# The waits add up to 100 seconds, but the total time is longer, because each
# try also spends time waiting for the AI providers to answer.
RETRY_WAITS = (10, 30, 60)


def call_with_retries(fn, waits=RETRY_WAITS, sleep=time.sleep):
    """Call fn(); if it fails, wait and try again, once per entry in waits.

    A ValueError means the request itself is wrong, so it isn't retried.
    The last error is raised if every try fails.
    """
    for attempt, wait in enumerate((*waits, None), start=1):
        try:
            return fn()
        except ValueError:
            raise
        except Exception as error:
            if wait is None:
                raise
            logger.warning("AI try %s failed (%s); trying again in %ss", attempt, error, wait)
            sleep(wait)


def parse_stops(stops, start: dt.date, end: dt.date) -> list[dict]:
    """Turn the AI's stops (dates and times as text) into itinerary item fields.

    Stops with a date or time that can't be read, outside the booking's dates,
    or without a place name are left out. A stop that ends before it starts
    gets no length (end = start).
    """
    items = []
    for stop in stops:
        try:
            day = dt.date.fromisoformat(stop.date)
            begin = dt.time.fromisoformat(stop.start_time)
            finish = dt.time.fromisoformat(stop.end_time)
        except (TypeError, ValueError):
            continue
        place = (stop.place_name or "").strip()
        if not place or not start <= day <= end:
            continue
        items.append(
            dict(
                date=day,
                start_time=begin,
                end_time=max(begin, finish),
                place_name=place[:200],
                activity=stop.activity or None,
                latitude=stop.latitude,
                longitude=stop.longitude,
            )
        )
    return items


def extra_requests(tourist) -> str | None:
    """Special requests and religious needs, which the AI should both consider.
    Emergency and medical details are private and never sent."""
    parts = [tourist.special_requests]
    if tourist.religious_needs:
        parts.append(f"Religious needs: {tourist.religious_needs}")
    text = "; ".join(p for p in parts if p)
    return text or None


def hhmm(value: dt.time | None) -> str | None:
    return value.strftime("%H:%M") if value else None


def fill_with_ai_draft(itinerary_id: int) -> None:
    # Imported here, so parse_stops() can be tested without a database or the AI package
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.enums import EditedBy
    from app.itinerary_rules import PLANNING
    from app.models import Booking, Guide, Itinerary, ItineraryItem, Tourist, Trip, TripSegment
    from app.services.ai_itinerary import generate_itinerary

    with SessionLocal() as db:
        itinerary = db.get(Itinerary, itinerary_id)
        if itinerary is None:
            return
        booking = db.get(Booking, itinerary.booking_id)
        segment = db.get(TripSegment, booking.segment_id)
        tourist = db.get(Tourist, db.get(Trip, segment.trip_id).tourist_id)
        guide = db.get(Guide, booking.guide_id)

        # Everything the AI needs, copied into plain values first
        request = dict(
            region=segment.region.value,
            start_date=booking.start_date.isoformat(),
            end_date=booking.end_date.isoformat(),
            service_type=booking.service_type.value,
            start_time=hhmm(booking.start_time),
            end_time=hhmm(booking.end_time),
            group_size=segment.group_size,
            transport_preference=segment.transport_preference.value,
            attributes=list(segment.attributes),
            budget=segment.budget,
            preferred_language=tourist.preferred_language.value,
            mobility_level=tourist.mobility_level.value,
            dietary=list(tourist.dietary),
            dietary_notes=tourist.dietary_notes,
            special_requests=extra_requests(tourist),
            guide_languages=list(guide.languages),
        )
        # End the read transaction before the slow AI call. Neon closes a connection
        # that sits "idle in transaction" too long, which made the draft fail.
        # (Ported from afiqzulhusni05's PR #6.)
        db.rollback()

        try:
            stops = call_with_retries(lambda: generate_itinerary(**request))
        except Exception:  # whatever goes wrong, the itinerary just stays empty
            logger.exception("AI draft failed for itinerary %s", itinerary_id)
            return

        # The plan may have moved on while the AI was working (cancelled, approved as it was,
        # or given stops by a person or another AI draft). Lock the itinerary row until the
        # commit below, so two drafts finishing together can't both be saved.
        db.refresh(booking)
        db.refresh(itinerary, with_for_update=True)
        has_stops = db.scalar(
            select(ItineraryItem.id).where(ItineraryItem.itinerary_id == itinerary.id).limit(1)
        )
        if (
            booking.status not in PLANNING
            or itinerary.approved_by_tourist
            or itinerary.approved_by_guide
            or has_stops is not None
        ):
            logger.info("Itinerary %s changed while the AI was working; draft not added", itinerary_id)
            return

        items = parse_stops(stops, booking.start_date, booking.end_date)
        for fields in items:
            db.add(
                ItineraryItem(
                    itinerary_id=itinerary.id,
                    **fields,
                    edited_by=EditedBy.AI,
                    # for tourists with mobility needs, the guide checks each AI stop on site
                    needs_accessibility_check=itinerary.needs_accessibility_check,
                )
            )
        db.commit()
        logger.info("AI draft added %s stops to itinerary %s", len(items), itinerary_id)
