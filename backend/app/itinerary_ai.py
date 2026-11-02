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

logger = logging.getLogger(__name__)


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

        try:
            stops = generate_itinerary(
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
        except Exception:  # whatever goes wrong, the itinerary just stays empty
            logger.exception("AI draft failed for itinerary %s", itinerary_id)
            return

        # The plan may have moved on while the AI was working (cancelled, or approved as it was)
        db.refresh(booking)
        db.refresh(itinerary)
        if booking.status not in PLANNING or itinerary.approved_by_tourist or itinerary.approved_by_guide:
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
