// The team's API (FastAPI + PostgreSQL): its raw calls and shapes. api.ts adapts them for the screens.
import { ApiError } from "./api";
import type { GuideProfileIn, Mobility, TripPreferences } from "./types";

const TEAM = (import.meta.env.VITE_TEAM_API_URL ?? "https://accessitour-api.onrender.com/api/v1").replace(/\/$/, "");

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${TEAM}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : "");
  }
  return res.json();
}

// ---------- accounts

export interface TeamUser { id: number; email: string; full_name: string; role: "TOURIST" | "GUIDE"; created_at: string }
export const me = (token: string) => call<TeamUser>("GET", "/users/me", token);

export const register = (email: string, password: string, fullName: string, role: "tourist" | "guide") =>
  call<unknown>("POST", "/auth/register", null, { email, password, full_name: fullName, role: role.toUpperCase() });

export const login = (email: string, password: string) =>
  call<{ access_token: string }>("POST", "/auth/login", null, { email, password }).then((r) => r.access_token);

// ---------- tourist profile

const MOBILITY_OUT: Record<Mobility, string> = { normal: "NORMAL", slow: "SLOW_WALK", wheelchair: "WHEELCHAIR" };
const MOBILITY_IN: Record<string, Mobility> = { NORMAL: "normal", SLOW_WALK: "slow", WHEELCHAIR: "wheelchair" };

interface TeamTourist {
  preferred_language: string;
  languages: string[];
  mobility_level: string;
  dietary: string[];
  [other: string]: unknown; // nationality, emergency info, ... kept as they are when we save
}

/** The parts of the saved preferences that live in the team API. null when the tourist has no profile there yet. */
export async function getTouristPrefs(token: string): Promise<Pick<TripPreferences, "languages" | "mobility" | "dietary"> | null> {
  try {
    const p = await call<TeamTourist>("GET", "/tourists/me", token);
    return {
      languages: p.languages?.length ? p.languages : [p.preferred_language],
      mobility: MOBILITY_IN[p.mobility_level] ?? "normal",
      dietary: (p.dietary ?? []).map((d) => d.toLowerCase()),
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function saveTouristPrefs(token: string, prefs: TripPreferences): Promise<void> {
  // The profile holds more than this app edits (nationality, emergency card, ...): read it first and keep the rest.
  let current: Record<string, unknown> = {};
  try {
    current = await call<TeamTourist>("GET", "/tourists/me", token);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  const { id: _id, user_id: _user, ...keep } = current;
  await call("PUT", "/tourists/me", token, {
    ...keep,
    preferred_language: prefs.languages[0],
    languages: prefs.languages,
    mobility_level: MOBILITY_OUT[prefs.mobility],
    dietary: prefs.dietary.map((d) => d.toUpperCase()),
  });
}

// ---------- guide profile

const ACCESS_OUT: Record<string, string> = { elderly_support: "SENIOR_SUPPORT" };
const ACCESS_IN: Record<string, string> = { SENIOR_SUPPORT: "elderly_support" };

interface TeamGuide {
  gender: "MALE" | "FEMALE";
  description: string | null;
  languages: string[];
  regions: string[];
  attributes: string[];
  accessibility_experience: string[];
  transport_options: string[];
  max_group_size: number;
  verified: boolean;
  services: { service_type: string; daily_rate: number | null; hourly_rate: number | null; min_hours: number | null; max_hours: number | null }[];
}

export interface TeamGuideProfile extends GuideProfileIn {
  verified: boolean;
}

/** The signed-in guide's profile, or null when they haven't created one yet. */
export async function getGuideProfile(token: string): Promise<TeamGuideProfile | null> {
  try {
    const g = await call<TeamGuide>("GET", "/guides/me", token);
    return {
      gender: g.gender, bio: g.description ?? "", languages: g.languages,
      regions: g.regions.map((r) => r.toLowerCase()),
      interests: g.attributes.map((a) => a.toLowerCase()),
      access_tags: g.accessibility_experience.map((a) => ACCESS_IN[a] ?? a.toLowerCase()),
      daily_rate: g.services.find((s) => s.service_type === "FULL_DAY")?.daily_rate ?? 0,
      verified: g.verified,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function saveGuideProfile(token: string, p: GuideProfileIn): Promise<void> {
  let current: Partial<TeamGuide> = {};
  try {
    current = await call<TeamGuide>("GET", "/guides/me", token);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  await call("PUT", "/guides/me", token, {
    gender: p.gender, description: p.bio || null, languages: p.languages,
    regions: p.regions.map((r) => r.toUpperCase()),
    attributes: p.interests.map((a) => a.toUpperCase()),
    accessibility_experience: p.access_tags.map((a) => ACCESS_OUT[a] ?? a.toUpperCase()),
    // not edited in this app: keep what the team API already has
    transport_options: current.transport_options ?? [],
    max_group_size: current.max_group_size ?? 4,
  });
  // The day rate is a "FULL_DAY" service. Hourly ("MICRO") services aren't edited here, so they are kept.
  const others = (current.services ?? []).filter((s) => s.service_type !== "FULL_DAY");
  const services = p.daily_rate > 0 ? [...others, { service_type: "FULL_DAY", daily_rate: p.daily_rate }] : others;
  await call("PUT", "/guides/me/services", token, { services });
}


// ---------- trips, matching and bookings
// A trip has one segment per city (or per day of short sessions). Matching reads the tourist profile above
// for languages and mobility, and the segment for dates, interests ("attributes") and budget.

export const TEAM_REGIONS = ["seoul", "busan", "jeju"]; // the only regions the team API accepts
export const MAX_SEGMENT_DAYS = 14; // the team API's limit for one segment

export interface TeamSegmentIn {
  region: string; // SEOUL | BUSAN | JEJU
  service_type: "FULL_DAY" | "MICRO";
  start_date: string;
  end_date: string;
  group_size: number;
  attributes: string[];
  budget: number | null; // the guide's whole fee for the segment, in won
}
export interface TeamSegment extends TeamSegmentIn {
  id: number;
  position: number;
  start_time: string | null;
  end_time: string | null;
}
export interface TeamTrip { id: number; title: string | null; start_date: string; end_date: string; created_at: string; segments: TeamSegment[] }

export interface TeamGuideSummary {
  id: number;
  full_name: string;
  gender: string;
  languages: string[];
  regions: string[];
  attributes: string[];
  accessibility_experience: string[];
  verified: boolean;
  rating_average: number;
  rating_count: number;
}
/** One scoring factor, with the team matcher's own explanation (English). */
export interface TeamFactor { factor: string; weight: number; score: number; points: number; reason: string }
export interface TeamMatch { guide: TeamGuideSummary; total_score: number; estimated_price: number; breakdown: TeamFactor[] }
export interface TeamSegmentMatches {
  segment: TeamSegment;
  total: number;
  items: TeamMatch[];
  excluded: { guide_id: number; full_name: string; reason: string }[];
}

export type TeamBookingStatus =
  | "REQUESTED" | "ACCEPTED" | "DECLINED" | "ITINERARY_DRAFT" | "IN_REVIEW" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export interface TeamBooking {
  id: number;
  status: TeamBookingStatus;
  trip_id: number;
  segment_id: number;
  region: string;
  service_type: string;
  start_date: string;
  end_date: string;
  group_size: number;
  total_price: number;
  guide: TeamGuideSummary;
  tourist: { id: number; full_name: string; preferred_language: string; mobility_level: string };
  created_at: string;
}

export const createTrip = (token: string, segments: TeamSegmentIn[]) => call<TeamTrip>("POST", "/trips", token, { segments });
export const listTrips = (token: string) => call<TeamTrip[]>("GET", "/trips", token);
export const getTrip = (token: string, id: number) => call<TeamTrip>("GET", `/trips/${id}`, token);
export const tripMatches = (token: string, id: number) =>
  call<{ trip_id: number; segments: TeamSegmentMatches[] }>("GET", `/trips/${id}/matches`, token);

export const createBooking = (token: string, segmentId: number, guideId: number) =>
  call<TeamBooking>("POST", "/bookings", token, { segment_id: segmentId, guide_id: guideId });
export async function myBookings(token: string): Promise<TeamBooking[]> {
  try {
    return await call<TeamBooking[]>("GET", "/bookings/me", token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return []; // no profile yet, so nothing booked
    throw e;
  }
}
export const bookingAction = (token: string, id: number, action: "accept" | "decline" | "cancel" | "complete") =>
  call<TeamBooking>("POST", `/bookings/${id}/${action}`, token);

export const MOBILITY_FROM_TEAM = MOBILITY_IN;
export const toTeamMobility = (m: Mobility) => MOBILITY_OUT[m];

// ---------- guide availability: the times a guide can be booked. Matching only offers guides who are free.

export interface TeamSlot { date: string; start_time: string; end_time: string } // times as HH:MM[:SS]
export const getAvailability = (token: string) => call<TeamSlot[]>("GET", "/guides/me/availability", token);
/** Replaces every upcoming slot with `slots` (the team API keeps past ones). */
export const saveAvailability = (token: string, slots: TeamSlot[]) =>
  call<TeamSlot[]>("PUT", "/guides/me/availability", token, { slots });


// ---------- itineraries: one per accepted booking, shared by its tourist and guide

export type TeamProgress = "UPCOMING" | "ON_THE_WAY" | "VISITED" | "SKIPPED";
export type TeamTransport = "TRANSIT" | "WALK" | "CAR" | "BICYCLE";
export interface TeamItemIn {
  date: string;
  start_time: string;
  end_time: string;
  place_name: string;
  activity: string | null;
  latitude: number | null;
  longitude: number | null;
  transport: TeamTransport | null;
  meal: "LUNCH" | "DINNER" | null;
}
export interface TeamItem extends TeamItemIn {
  id: number;
  edited_by: "AI" | "TOURIST" | "GUIDE";
  progress: TeamProgress;
  needs_accessibility_check: boolean;
}
export interface TeamComment { id: number; item_id: number | null; author: "TOURIST" | "GUIDE"; author_name: string; body: string; created_at: string }
export interface TeamItinerary {
  id: number;
  booking_id: number;
  booking_status: TeamBookingStatus;
  trip_id: number;
  region: string;
  start_date: string;
  end_date: string;
  group_size: number;
  tourist: TeamBooking["tourist"];
  guide: TeamGuideSummary;
  you_are: "TOURIST" | "GUIDE";
  accessibility_review: boolean;
  approved_by_tourist: boolean;
  approved_by_guide: boolean;
  items: TeamItem[];
  comments: TeamComment[];
}
export interface TeamItinerarySummary {
  id: number; booking_id: number; trip_id: number; region: string; start_date: string; end_date: string;
  tourist_name: string; guide_name: string; stops: number; approved_by_tourist: boolean; approved_by_guide: boolean;
}

const IT = "/itineraries";
export const listItineraries = (token: string) => call<TeamItinerarySummary[]>("GET", IT, token);
/** The itinerary for an accepted booking, created (empty) the first time either side opens it. */
export const openItinerary = (token: string, bookingId: number) => call<TeamItinerary>("POST", IT, token, { booking_id: bookingId });
export const getItinerary = (token: string, id: number) => call<TeamItinerary>("GET", `${IT}/${id}`, token);
export const addItem = (token: string, id: number, item: TeamItemIn) => call<TeamItinerary>("POST", `${IT}/${id}/items`, token, item);
export const updateItem = (token: string, id: number, itemId: number, changes: Partial<TeamItemIn>) =>
  call<TeamItinerary>("PATCH", `${IT}/${id}/items/${itemId}`, token, changes);
export const deleteItem = (token: string, id: number, itemId: number) => call<TeamItinerary>("DELETE", `${IT}/${id}/items/${itemId}`, token);
export const setProgress = (token: string, id: number, itemId: number, progress: TeamProgress) =>
  call<TeamItinerary>("PUT", `${IT}/${id}/items/${itemId}/progress`, token, { progress });
export const checkItem = (token: string, id: number, itemId: number) => call<TeamItinerary>("POST", `${IT}/${id}/items/${itemId}/check`, token);
export const addComment = (token: string, id: number, body: string, itemId: number | null) =>
  call<TeamItinerary>("POST", `${IT}/${id}/comments`, token, { body, item_id: itemId });
export const approve = (token: string, id: number) => call<TeamItinerary>("POST", `${IT}/${id}/approve`, token);
