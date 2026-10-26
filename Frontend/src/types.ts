// Mirrors backend/app/schemas.py. Later: generate with `npx openapi-typescript http://localhost:8000/openapi.json`.
export type Mobility = "normal" | "slow" | "wheelchair";

export interface TouristProfile {
  region: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  party_size: number;
  languages: string[]; // acceptable guide languages, most preferred first
  budget_per_day: number; // KRW
  mobility: Mobility;
  interests: string[];
  dietary: string[];
  religious: string[];
  notes: string;
  plan_id?: number | null; // set when this city is one leg of a multi-city trip
}

/** One city of a multi-city trip. Dates are YYYY-MM-DD: arrival and departure. */
export interface TripLeg { region: string; start_date: string; end_date: string }
/** How the traveller gets from one city to the next. "" = not decided yet. */
export type Transfer = "" | "train" | "bus" | "flight" | "ferry" | "car";
/** The outline of a multi-city trip. Each city is then matched, booked and planned on its own. */
export interface TripPlan {
  id: number;
  legs: TripLeg[];
  transfers: Transfer[]; // one fewer than legs
  prefs: TripPreferences;
  created_at: string;
}

export interface Guide {
  id: number;
  name: string; // romanized
  name_ko: string;
  bio: string;
  bio_ko: string;
  regions: string[];
  languages: string[];
  daily_rate: number;
  interests: string[];
  rating: number;
  review_count: number;
  access_tags: string[];
  verified_tags: string[];
}

export interface MatchResult {
  guide: Guide;
  score: number; // 0..1
  breakdown: Record<string, number>; // factor -> 0..1
  penalties: string[];
}

export type Role = "tourist" | "guide"; // which side of an itinerary someone is on

export interface Comment {
  author: Role;
  body: string;
  created_at: string;
}

/** Where the traveller is with a stop on the day itself. */
export type Progress = "upcoming" | "on_the_way" | "visited" | "skipped";
/** "" = use the way of travelling chosen for the whole trip. */
export type Transport = "" | "transit" | "walk" | "car" | "bicycle";

export interface ItineraryItem {
  id: number;
  day_number: number; // 1-based
  start_time: string; // HH:MM
  place_name: string;
  activity: string;
  lat: number | null; // approximate map position; null = not on the map
  lng: number | null;
  meal: Meal | null; // set when the stop is a restaurant picked for lunch or dinner
  status: "ai_draft" | "edited" | "approved";
  progress: Progress;
  duration_min: number; // planned length of the visit; 0 = not set
  transport: Transport; // how the traveller gets to this stop
  needs_accessibility_check: boolean;
  version: number;
  last_edited_by: Role | null;
  comments: Comment[];
}

export interface Itinerary {
  id: number;
  owner_name: string; // the tourist who created it
  guide_id: number;
  guide_name: string;
  guide_name_ko: string;
  trip: TouristProfile;
  source: "ai" | "sample"; // "sample" = backend had no LLM available
  days: number;
  accessibility_review: boolean;
  approved_by_tourist: boolean;
  approved_by_guide: boolean;
  items: ItineraryItem[];
  messages: Comment[];
}

export type StopFields = Pick<ItineraryItem, "day_number" | "start_time" | "place_name" | "activity"> & {
  lat?: number | null;
  lng?: number | null;
  meal?: Meal | null;
  duration_min?: number;
  transport?: Transport;
};

export type Meal = "lunch" | "dinner";
export type Cuisine = "korean" | "chinese" | "japanese" | "western" | "seafood";
export type MealDiet = "halal" | "vegetarian" | "vegan";

export interface MealOptions {
  source: "ai" | "osm" | "none";
  start_time: string; // a free slot in the meal window, between the day's other stops
  places: Recommendation[];
}

export interface Bounds { south: number; west: number; north: number; east: number }

export interface Recommendation {
  place_name: string;
  activity: string;
  lat: number;
  lng: number;
}

export interface Recommendations {
  source: "ai" | "osm" | "sample";
  places: Recommendation[];
}

// ---------- accounts

export type AccountRole = "tourist" | "guide" | "admin";

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: AccountRole;
  guide_id: number | null; // for guides: their profile in the guide list
}

export interface Session {
  token: string;
  user: User;
}

/** What a guide fills in when signing up. */
export interface GuideProfileIn {
  gender: "MALE" | "FEMALE"; // required by the team API
  bio: string;
  regions: string[];
  languages: string[];
  daily_rate: number;
  interests: string[];
  access_tags: string[];
}

export interface SignupRequest {
  email: string;
  password: string;
  display_name: string;
  role: "tourist" | "guide";
  guide?: GuideProfileIn;
}

export interface ItinerarySummary {
  plan_id: number | null;
  id: number;
  guide_name: string;
  guide_name_ko: string;
  owner_name: string;
  region: string;
  start_date: string;
  end_date: string;
  stops: number;
  approved_by_tourist: boolean;
  approved_by_guide: boolean;
}

/** A tourist's saved defaults, used to pre-fill the trip profile. */
export interface TripPreferences {
  languages: string[];
  mobility: Mobility;
  interests: string[];
  dietary: string[];
  budget_per_day: number;
  party_size: number; // still sent by the API but not used: travellers are chosen per trip
}

export type BookingStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface Booking {
  id: number;
  status: BookingStatus;
  owner_name: string; // the tourist
  guide_id: number;
  guide_name: string;
  guide_name_ko: string;
  trip: TouristProfile;
  score: number; // match score when the request was sent, 0..1
  created_at: string;
  itinerary_id: number | null; // set once the guide accepts
}

/** One guide search, for the admin's matching activity view. */
export interface MatchLogEntry {
  at: string;
  tourist: string;
  region: string;
  languages: string[];
  mobility: Mobility;
  results: number;
  top_guide: string | null;
  top_score: number | null;
}
