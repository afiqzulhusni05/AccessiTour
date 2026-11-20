"""Tests for the GPT-6 Luna -> Gemini fallback (no real AI or Kakao calls).

Run from the backend folder:  pytest -v
"""

from app.services import ai_itinerary
from app.services.ai_itinerary import GeneratedStop, GeneratedStops, generate_itinerary


def test_an_unexpected_luna_error_falls_back_to_gemini(monkeypatch):
    def broken_luna(prompt):
        raise ValueError("unexpected Luna error")

    gemini_stops = GeneratedStops([
        GeneratedStop(
            date="2026-11-27", start_time="10:00", end_time="11:00",
            place_name="Busan Museum", activity="Visit the museum",
        )
    ])
    monkeypatch.setattr(ai_itinerary, "generate_with_baze", broken_luna)
    monkeypatch.setattr(ai_itinerary, "generate_with_gemini", lambda prompt: gemini_stops)
    monkeypatch.setattr(ai_itinerary, "find_verified_place", lambda **kwargs: None)  # no Kakao call

    stops = generate_itinerary(
        region="BUSAN", start_date="2026-11-27", end_date="2026-11-27",
        service_type="FULL_DAY", start_time=None, end_time=None,
        group_size=2, transport_preference="PUBLIC", attributes=[], budget=None,
        preferred_language="en", mobility_level="NORMAL", dietary=[],
        dietary_notes=None, special_requests=None, guide_languages=["en"],
    )

    assert [s.place_name for s in stops] == ["Busan Museum"]
