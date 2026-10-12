from typing import Optional
from google import genai
from google.genai import errors
from pydantic import BaseModel, RootModel, ValidationError
from app.config import settings


class ItineraryStop(BaseModel):
    date: str
    start_time: str
    end_time: str
    place_name: str
    activity: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ItineraryStops(RootModel[list[ItineraryStop]]):
    pass

client = genai.Client(api_key=settings.gemini_api_key)

def generate_itinerary(
    region: str,
    start_date: str,
    end_date: str,
    service_type: str,
    start_time: Optional[str],
    end_time: Optional[str],
    group_size: int,
    transport_preference: str,
    attributes: list[str],
    budget: Optional[int],
    preferred_language: str,
    mobility_level: str,
    dietary: list[str],
    dietary_notes: Optional[str],
    special_requests: Optional[str],
    guide_languages: list[str],
) -> list[ItineraryStop]:
    
    # Prepare list values for the Gemini prompt
    attributes_text = ", ".join(attributes) if attributes else "None"
    dietary_text = ", ".join(dietary) if dietary else "None"
    guide_languages_text = ", ".join(guide_languages) if guide_languages else "None"

    dietary_notes_text = dietary_notes if dietary_notes else "None"
    special_requests_text = special_requests if special_requests else "None"

    # Check that the service type has valid times
    if service_type == "MICRO":
        if start_time is None or end_time is None:
            raise ValueError(
                "MICRO service requires start_time and end_time."
            )

    elif service_type == "FULL_DAY":
        if start_time is not None or end_time is not None:
            raise ValueError(
                "FULL_DAY service should not have start_time or end_time."
            )

    else:
        raise ValueError(
            "service_type must be MICRO or FULL_DAY."
        )
        
    # Create instructions based on the service type
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
    try:
        interaction = client.interactions.create(
            model="gemini-3.8-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": ItineraryStops.model_json_schema(),
            },
        )

        if not interaction.output_text:
            raise RuntimeError("Gemini returned no itinerary.")

        # Validate Gemini's JSON output
        stops = ItineraryStops.model_validate_json(
            interaction.output_text
        )

        # Return the actual list of itinerary stops
        return stops.root

    except errors.ServerError as error:
        raise RuntimeError(
            "Gemini is temporarily unavailable."
        ) from error

    except errors.ClientError as error:
        raise RuntimeError(
            "Gemini rejected the request."
        ) from error

    except ValidationError as error:
        raise RuntimeError(
            "Gemini returned an invalid itinerary structure."
        ) from error