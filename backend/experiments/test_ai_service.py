from app.services.ai_itinerary import generate_itinerary

stops = generate_itinerary(
    region="BUSAN",
    start_date="2026-10-20",
    end_date="2026-10-22",
    service_type="FULL_DAY",
    start_time=None,
    end_time=None,
    group_size=2,
    transport_preference="PUBLIC",
    attributes=["FOOD", "CULTURE"],
    budget=100000,
    preferred_language="en",
    mobility_level="SLOW_WALK",
    dietary=["HALAL"],
    dietary_notes=None,
    special_requests="Prefers frequent rest stops",
    guide_languages=["ko", "en"],
)

print("===== Real AI service result =====")

for stop in stops:
    print(stop.model_dump())