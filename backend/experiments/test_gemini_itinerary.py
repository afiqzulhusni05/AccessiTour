import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors

# 1. Load the API key from the .env file
load_dotenv()

if not os.getenv("GEMINI_API_KEY"):
    print("GEMINI_API_KEY was not found. Check your .env file.")
    raise SystemExit(1)

# 2. Create the Gemini client (it reads GEMINI_API_KEY automatically)
client = genai.Client()

# 3. Sample traveler profile
destination = "Busan"
start_date = "2026-10-20"
end_date = "2026-10-22"
duration_days = 3
budget = "Medium"
interests = ["Food", "Culture"]
mobility_level = "Slow walking"
dietary_requirements = "Halal"
preferred_language = "English"
number_of_travelers = 2
selected_guide_region = "Busan"
selected_guide_languages = ["Korean", "English"]

# Turn the lists into plain text, e.g. "Food, Culture"
interests_text = ", ".join(interests)
guide_languages_text = ", ".join(selected_guide_languages)

# 4. Build the prompt
prompt = f"""
You are a travel planner for foreign tourists visiting South Korea.

Create a realistic {duration_days}-day travel itinerary for this traveler.

Traveler profile:
- Destination: {destination}
- Start date: {start_date}
- End date: {end_date}
- Duration: {duration_days} days
- Budget: {budget}
- Interests: {interests_text}
- Mobility level: {mobility_level}
- Dietary requirements: {dietary_requirements}
- Preferred language: {preferred_language}
- Number of travelers: {number_of_travelers}

Selected guide:
- Guide region: {selected_guide_region}
- Guide languages: {guide_languages_text}

Rules:
- Recommend specific real attractions in {destination} where possible.
- For restaurants and meal locations, only name a specific restaurant when
  reasonably confident it exists and matches the dietary requirement.
  Otherwise, recommend the district and type of restaurant and write
  "Guide verification required."
- Do not invent a hotel, arrival time, or departure time.
- Plan full travel days unless arrival or departure information is provided.
- Keep each day geographically reasonable, preferably within one or two
  nearby districts.
- State the approximate travel time and suggested transport between
  consecutive stops.
- Every meal recommendation must respect this dietary requirement:
  {dietary_requirements}.
- Seafood, vegetarian, pork-free, or alcohol-free food must not automatically
  be described as Halal. If Halal status cannot be confirmed, write
  "Guide verification required."
- Only mention mobility considerations relevant to the traveler's actual
  mobility level: {mobility_level}.
- Never mention wheelchair accessibility, wheelchair ramps, wheelchair
  rentals, or wheelchair-specific facilities unless the mobility level
  explicitly says that the traveler uses a wheelchair.  
- For slow walking, avoid long walking distances, steep routes, excessive
  stairs, and overly packed schedules.
- Give an approximate cost per person for activities and meals in KRW.
  Clearly state that costs are estimates.
- Do not state accessibility features as confirmed facts unless verified.
  Use cautious wording and mark accessibility information
  "Guide verification required."
- Organize the itinerary day by day with the correct date.
- Give approximate start and end times for each activity.
- Briefly explain each activity.
- Write the itinerary in {preferred_language}.
- Treat travel times and transport durations as rough estimates only.
  Clearly label them as estimates that should later be verified.
- This is an initial draft that the traveler and guide will edit later.
"""

# 5. Send the prompt to Gemini and print the result
try:
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
    )

    if response.text:
        print("===== Generated itinerary (draft) =====")
        print(response.text)
    else:
        print("Gemini answered, but the answer had no text. Please try again.")

except errors.ServerError as error:
    # 5xx errors, such as 503 "model is overloaded / high demand"
    print("Gemini is busy or temporarily unavailable right now.")
    print("Please wait a minute and run the script again.")
    print(f"(Details: {error.code} {error.message})")

except errors.ClientError as error:
    # 4xx errors, such as a wrong API key, wrong model name, or rate limit
    print("Gemini rejected the request.")
    print("Check your API key, the model name, and your usage limit.")
    print(f"(Details: {error.code} {error.message})")

except Exception as error:
    # Anything else, such as no internet connection
    print("Something unexpected went wrong.")
    print(f"(Details: {error})")