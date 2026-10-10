import os
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import errors
from pydantic import BaseModel, RootModel, ValidationError


# --------------------------------------------------
# 1. Define the JSON output expected by the backend
# --------------------------------------------------

class ItineraryStop(BaseModel):
    date: str
    start_time: str
    end_time: str
    place_name: str
    activity: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# The backend expects a list of itinerary stops
class ItineraryStops(RootModel[list[ItineraryStop]]):
    pass


# --------------------------------------------------
# 2. Load Gemini API key
# --------------------------------------------------

load_dotenv()

if not os.getenv("GEMINI_API_KEY"):
    print("GEMINI_API_KEY was not found. Check your .env file.")
    raise SystemExit(1)


# --------------------------------------------------
# 3. Create Gemini client
# --------------------------------------------------

client = genai.Client()


# --------------------------------------------------
# 4. Sample trip segment from the backend
# --------------------------------------------------

# Region of THIS trip segment
region = "BUSAN"

# Dates of THIS trip segment
start_date = "2026-10-20"
end_date = "2026-10-22"

# FULL_DAY = guide booked for full day(s)
# MICRO = guide booked only for a few hours
service_type = "FULL_DAY"

# Only used for MICRO
start_time = None
end_time = None

# Tourist information
group_size = 2

transport_preference = "PUBLIC"

attributes = [
    "FOOD",
    "CULTURE"
]

# Guide fee budget in KRW
# Can also be None
budget = 100000

# Language code
preferred_language = "en"

mobility_level = "SLOW_WALK"

dietary = [
    "HALAL"
]

# Optional extra dietary information
dietary_notes = None

# Optional tourist request
special_requests = "Prefers frequent rest stops"

# Languages spoken by the selected guide
guide_languages = [
    "ko",
    "en"
]


# --------------------------------------------------
# 5. Prepare values for the prompt
# --------------------------------------------------

attributes_text = ", ".join(attributes) if attributes else "None"
dietary_text = ", ".join(dietary) if dietary else "None"
guide_languages_text = ", ".join(guide_languages) if guide_languages else "None"

budget_text = str(budget) if budget is not None else "None"
dietary_notes_text = dietary_notes if dietary_notes else "None"
special_requests_text = special_requests if special_requests else "None"


# --------------------------------------------------
# 6. Check service type
# --------------------------------------------------

if service_type == "MICRO":
    if start_time is None or end_time is None:
        print("MICRO service requires start_time and end_time.")
        raise SystemExit(1)

elif service_type == "FULL_DAY":
    if start_time is not None or end_time is not None:
        print("FULL_DAY service should not have start_time or end_time.")
        raise SystemExit(1)

else:
    print("service_type must be MICRO or FULL_DAY.")
    raise SystemExit(1)


# --------------------------------------------------
# 7. Create service-specific instructions
# --------------------------------------------------

if service_type == "MICRO":
    service_instructions = f"""
This is a MICRO trip segment.

- Generate itinerary stops only for {start_date}.
- Every stop must be between {start_time} and {end_time}.
- Do not generate activities outside this time range.
"""

else:
    service_instructions = f"""
This is a FULL_DAY trip segment.

- Generate itinerary stops covering every date from
  {start_date} to {end_date}.
- Create a reasonable full-day schedule for each date.
- Do not invent hotel check-in, arrival, or departure times.
"""


# --------------------------------------------------
# 8. Build the prompt
# --------------------------------------------------

prompt = f"""
You are the AI itinerary generator for AccessiTour.

The backend sends you information for ONE booked trip segment.
Create a personalized itinerary for this segment only.

TRIP SEGMENT INFORMATION

Region: {region}
Start date: {start_date}
End date: {end_date}
Service type: {service_type}
Start time: {start_time}
End time: {end_time}

Group size: {group_size}

Transport preference:
{transport_preference}

Traveler attributes:
{attributes_text}

Guide fee budget:
{budget_text}

Preferred language:
{preferred_language}

Mobility level:
{mobility_level}

Dietary requirements:
{dietary_text}

Dietary notes:
{dietary_notes_text}

Special requests:
{special_requests_text}

Selected guide languages:
{guide_languages_text}


SERVICE RULES

{service_instructions}


ITINERARY RULES

- Generate an itinerary only for this trip segment.

- Recommend real places in {region} where reasonably confident.

- Use the traveler attributes when choosing places and activities.

- Respect the transport preference:
  {transport_preference}.

- Respect the mobility level:
  {mobility_level}.

- If mobility_level is SLOW_WALK:
  avoid unnecessary long walks, steep routes, excessive stairs,
  and overly packed schedules.

- Only include wheelchair-specific considerations when
  mobility_level is WHEELCHAIR.

- Respect all dietary requirements:
  {dietary_text}.

- Also consider these dietary notes:
  {dietary_notes_text}.

- Seafood, vegetarian, pork-free, or alcohol-free food must not
  automatically be considered HALAL.

- Consider these special requests:
  {special_requests_text}.

- Keep consecutive stops geographically reasonable.

- Leave enough time between stops for travel.

- Do not invent a hotel, hotel location, arrival time,
  or departure time.

- Do not confidently invent changing real-world facts such as
  opening hours, accessibility facilities, or Halal certification.

- The budget value is the guide fee budget.
  Do not treat it as the tourist's total food or attraction budget.

- Write the activity description using the language represented by:
  {preferred_language}.

- place_name should contain the real or commonly used name
  of the location.

- For now, always return null for latitude and longitude.
  Coordinates will be added and verified later using the map/place API.

- All dates must use YYYY-MM-DD.

- All times must use 24-hour HH:MM.

- Return the stops in chronological order.

- Return only these fields:
  date
  start_time
  end_time
  place_name
  activity
  latitude
  longitude

- Do not return extra fields.

The backend will separately handle:
- accessibility-check labels
- who edited an itinerary item
- database IDs
"""


# --------------------------------------------------
# 9. Ask Gemini for structured JSON
# --------------------------------------------------

try:
    interaction = client.interactions.create(
        model="gemini-3.5-flash",
        input=prompt,
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": ItineraryStops.model_json_schema(),
        },
    )

    if not interaction.output_text:
        print("Gemini returned no text.")
        raise SystemExit(1)

    # Check that Gemini's response matches the backend structure
    stops = ItineraryStops.model_validate_json(
        interaction.output_text
    )

    print("===== Generated itinerary stops =====")

    # Print JSON in a readable format
    print(stops.model_dump_json(indent=2))


# --------------------------------------------------
# 10. Error handling
# --------------------------------------------------

except errors.ServerError as error:
    print("Gemini is busy or temporarily unavailable.")
    print("Please wait and try again.")
    print(f"(Details: {error.code} {error.message})")


except errors.ClientError as error:
    print("Gemini rejected the request.")
    print("Check your API key, model name, and usage limits.")
    print(f"(Details: {error.code} {error.message})")


except ValidationError as error:
    print(
        "Gemini returned JSON, but it did not match "
        "the backend itinerary structure."
    )
    print(error)


except Exception as error:
    print("Something unexpected went wrong.")
    print(f"(Details: {error})")