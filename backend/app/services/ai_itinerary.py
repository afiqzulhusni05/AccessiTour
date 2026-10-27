from typing import Literal, Optional

from google import genai
from google.genai import errors
from pydantic import (
    BaseModel,
    RootModel,
    ValidationError,
)

from app.config import settings
from app.services.kakao_place import (
    find_verified_place,
)


# --------------------------------------------------
# Public API response model
# --------------------------------------------------

class ItineraryStop(BaseModel):
    date: str
    start_time: str
    end_time: str
    place_name: str
    activity: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ItineraryStops(
    RootModel[list[ItineraryStop]]
):
    pass


# --------------------------------------------------
# Internal Gemini output model
# --------------------------------------------------

class GeneratedStop(BaseModel):
    date: str
    start_time: str
    end_time: str

    # Name shown to the tourist.
    place_name: str

    # Korean name used only to search Kakao.
    place_name_ko: Optional[str] = None

    # Helps verify Kakao category.
    place_category: Literal[
        "FOOD",
        "ATTRACTION",
        "OTHER",
    ] = "OTHER"

    activity: str


class GeneratedStops(
    RootModel[list[GeneratedStop]]
):
    pass


# --------------------------------------------------
# Gemini place-name rules
# --------------------------------------------------

PLACE_NAME_RULES = """
- place_name:
  Write the place name for the traveler using the language
  represented by preferred_language.

- place_name_ko:
  When reasonably confident, provide the official Korean place
  name exactly as it would normally appear on a Korean map service.

  For restaurants or cafes, include the branch name when known.

  Examples:
  "부산박물관"
  "카파도키아 부산대점"

  Do not add the city name just for searching.
  Do not add explanations or parentheses.

  If you are not reasonably confident about the official Korean
  name, return null instead of guessing.

- place_category:
  Use "FOOD" for restaurants and cafes.

  Use "ATTRACTION" for places such as museums, parks,
  markets, beaches, historical sites, religious sites,
  observatories and other tourist attractions.

  Use "OTHER" when neither category applies.

- Return only these fields for each generated stop:
  date
  start_time
  end_time
  place_name
  place_name_ko
  place_category
  activity

- Do not return latitude or longitude.
  Gemini must never guess coordinates.
  The backend will verify the place through Kakao
  and add coordinates separately.
"""


client = genai.Client(
    api_key=settings.gemini_api_key
)


# --------------------------------------------------
# Attach verified Kakao coordinates
# --------------------------------------------------

def attach_verified_coordinates(
    generated_stops: GeneratedStops,
    region: str,
) -> list[ItineraryStop]:
    """
    Convert Gemini's internal GeneratedStop objects into
    the public ItineraryStop response.

    Coordinates are added only when Kakao confidently
    verifies the place.
    """

    final_stops = []

    for stop in generated_stops.root:
        latitude = None
        longitude = None

        place = find_verified_place(
            names=[
                stop.place_name_ko,
                stop.place_name,
            ],
            region=region,
            place_category=stop.place_category,
        )

        if place:
            latitude = place["latitude"]
            longitude = place["longitude"]

        final_stops.append(
            ItineraryStop(
                date=stop.date,
                start_time=stop.start_time,
                end_time=stop.end_time,
                place_name=stop.place_name,
                activity=stop.activity,
                latitude=latitude,
                longitude=longitude,
            )
        )

    return final_stops


# --------------------------------------------------
# Generate itinerary
# --------------------------------------------------

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

    # Prepare list values for Gemini.
    attributes_text = (
        ", ".join(attributes)
        if attributes
        else "None"
    )

    dietary_text = (
        ", ".join(dietary)
        if dietary
        else "None"
    )

    guide_languages_text = (
        ", ".join(guide_languages)
        if guide_languages
        else "None"
    )

    dietary_notes_text = (
        dietary_notes
        if dietary_notes
        else "None"
    )

    special_requests_text = (
        special_requests
        if special_requests
        else "None"
    )

    budget_text = (
        str(budget)
        if budget is not None
        else "Not provided"
    )

    # --------------------------------------------------
    # Validate service type
    # --------------------------------------------------

    if service_type == "MICRO":
        if (
            start_time is None
            or end_time is None
        ):
            raise ValueError(
                (
                    "MICRO service requires "
                    "start_time and end_time."
                )
            )

    elif service_type == "FULL_DAY":
        if (
            start_time is not None
            or end_time is not None
        ):
            raise ValueError(
                (
                    "FULL_DAY service should not have "
                    "start_time or end_time."
                )
            )

    else:
        raise ValueError(
            (
                "service_type must be "
                "MICRO or FULL_DAY."
            )
        )

    # --------------------------------------------------
    # Service-specific instructions
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
    # Gemini prompt
    # --------------------------------------------------

    prompt = f"""
You are the AI itinerary generator for AccessiTour.

The backend sends you information for ONE booked trip segment.
Create a personalized itinerary for this segment only.

TRIP SEGMENT INFORMATION

Region:
{region}

Start date:
{start_date}

End date:
{end_date}

Service type:
{service_type}

Start time:
{start_time}

End time:
{end_time}

Group size:
{group_size}

Transport preference:
{transport_preference}

Traveler attributes:
{attributes_text}

Guide fee budget in KRW:
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

- Do not invent fictional attractions, restaurants, cafes,
  museums, stations or businesses.

- Use the traveler attributes when choosing places
  and activities.

- Respect the transport preference:
  {transport_preference}.

- Respect the mobility level:
  {mobility_level}.

- If mobility_level is SLOW_WALK:
  avoid unnecessary long walks, steep routes,
  excessive stairs and overly packed schedules.

- Only include wheelchair-specific considerations when
  mobility_level is WHEELCHAIR.

- Respect all dietary requirements:
  {dietary_text}.

- Also consider these dietary notes:
  {dietary_notes_text}.

- Seafood, vegetarian, pork-free or alcohol-free food
  must not automatically be considered HALAL.

- Do not confidently claim that a restaurant is
  Halal-certified unless you are reasonably confident.

- Consider these special requests:
  {special_requests_text}.

- Keep consecutive stops geographically reasonable.

- Leave enough time between stops for travel.

- Do not invent a hotel, hotel location, arrival time
  or departure time.

- Do not confidently invent changing real-world facts
  such as opening hours, accessibility facilities
  or Halal certification.

- The budget value is the guide fee budget.
  Do not treat it as the tourist's total food,
  attraction or transportation budget.

- Write the activity description using the language
  represented by:
  {preferred_language}.

- All dates must use YYYY-MM-DD.

- All times must use 24-hour HH:MM.

- Return the stops in chronological order.


PLACE OUTPUT RULES

{PLACE_NAME_RULES}


The backend will separately handle:
- place verification
- latitude and longitude
- accessibility-check labels
- who edited an itinerary item
- database IDs
"""

    # --------------------------------------------------
    # Gemini request
    # --------------------------------------------------

    try:
        interaction = client.interactions.create(
            model="gemini-3.8-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": (
                    GeneratedStops.model_json_schema()
                ),
            },
        )

        if not interaction.output_text:
            raise RuntimeError(
                "Gemini returned no itinerary."
            )

        # Validate Gemini's internal JSON structure.
        generated_stops = (
            GeneratedStops.model_validate_json(
                interaction.output_text
            )
        )

        # Kakao verifies each place and fills coordinates.
        return attach_verified_coordinates(
            generated_stops,
            region,
        )

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
            (
                "Gemini returned an invalid "
                "itinerary structure."
            )
        ) from error