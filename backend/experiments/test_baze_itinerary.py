import requests
import json

from app.config import settings
from app.services.ai_itinerary import (
    GeneratedStops,
    PLACE_NAME_RULES,
    attach_verified_coordinates,
)


BASE_URL = "https://api.baze.co/v1/gateway"
MODEL = "gpt-6-luna"


prompt = f"""
You are the AI itinerary generator for AccessiTour.

Create a personalized itinerary for ONE booked trip segment.

TRIP SEGMENT INFORMATION

Region:
BUSAN

Start date:
2026-10-20

End date:
2026-10-20

Service type:
FULL_DAY

Group size:
2

Transport preference:
PUBLIC

Traveler attributes:
FOOD, CULTURE

Guide fee budget in KRW:
100000

Preferred language:
en

Mobility level:
SLOW_WALK

Dietary requirements:
HALAL

Dietary notes:
None

Special requests:
Prefers frequent rest stops

Selected guide languages:
ko, en


ITINERARY RULES

- Generate an itinerary only for this trip segment.

- Generate a reasonable full-day schedule for 2026-10-20.

- Recommend real places in BUSAN where reasonably confident.

- Do not invent fictional attractions, restaurants, cafes,
  museums, stations or businesses.

- Respect PUBLIC transport preference.

- Respect SLOW_WALK mobility.
  Avoid unnecessary long walks, steep routes,
  excessive stairs and overly packed schedules.

- Treat dietary requirements such as HALAL as traveler
  preferences or requirements, not as verified facts
  about a restaurant.

- Seafood, vegetarian, pork-free or alcohol-free food
  must not automatically be considered HALAL.

- Do not describe a restaurant, cafe, dish, or meal as
  "Halal", "Halal-certified", or guaranteed to satisfy
  the traveler's dietary requirement unless that status
  has been explicitly verified by reliable external data.

- If dietary compliance has not been verified, use neutral
  wording and recommend confirming the requirement with
  the restaurant.

- Never invent Halal certification or dietary compliance.

- Keep consecutive stops geographically reasonable.

- Leave enough time between stops for travel.

- Do not invent hotel information.

- Do not confidently invent changing real-world facts
  such as opening hours, accessibility facilities,
  or certifications.
  
- Every itinerary stop must be a real physical place.
   Do not create "Travel and rest break" as a stop.

- Do not claim accessibility features such as elevators,
   step-free access, accessible promenades, seating, or level paths
   unless verified by external data.

- Write activity descriptions in English.

- All dates must use YYYY-MM-DD.
- All times must use 24-hour HH:MM.
- Return stops in chronological order.


PLACE OUTPUT RULES

{PLACE_NAME_RULES}


Return valid JSON only.

The complete response must have this structure:

{{
  "root": [
    {{
      "date": "2026-10-20",
      "start_time": "10:00",
      "end_time": "11:30",
      "place_name": "Example Place",
      "place_name_ko": "예시 장소",
      "place_category": "ATTRACTION",
      "activity": "Description"
    }}
  ]
}}
"""


response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={
        "Authorization": f"Bearer {settings.baze_api_key}",
        "Content-Type": "application/json",
    },
    json={
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "response_format": {
            "type": "json_object"
        },
    },
    timeout=120,
)

print("Status:", response.status_code)

response.raise_for_status()

data = response.json()

content = data["choices"][0]["message"]["content"]

print("\n===== RAW GPT OUTPUT =====")
print(content)

parsed = json.loads(content)

generated_stops = GeneratedStops.model_validate(
    parsed["root"]
)

final_stops = attach_verified_coordinates(
    generated_stops,
    region="BUSAN",
)

print("\n===== BAZE GPT FINAL RESULT =====")

for stop in final_stops:
    print(stop.model_dump())