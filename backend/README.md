# AI Itinerary Generation

This folder contains experiments for the AI itinerary generation feature of AccessiTour.

## Current Features

- Gemini API connection
- Personalized itinerary generation
- Traveler preference-based itinerary planning
- Structured JSON itinerary output
- Pydantic validation
- Basic Gemini API error handling

The itinerary currently considers:

- destination
- travel dates
- duration
- budget
- interests
- mobility level
- dietary requirements
- preferred language
- number of travelers
- selected guide region
- selected guide languages

## Files

### `test_gemini_itinerary.py`

Tests personalized itinerary generation using Gemini.

The result is displayed as a human-readable itinerary.

### `test_gemini_itinerary_json.py`

Tests structured itinerary generation using Gemini.

The result is returned as JSON containing information such as:

- day and date
- start and end time
- place
- district
- activity type
- activity description
- estimated cost
- mobility notes
- dietary notes
- guide verification requirements
- transport information
- estimated travel time

## Setup

Create a `.env` file in the AccessiTour project root and add:

```text
GEMINI_API_KEY=your_api_key_here
