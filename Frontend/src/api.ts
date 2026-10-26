/**
 * Everything the screens ask the server for. There is one server: the team's API (FastAPI + PostgreSQL,
 * teamApi.ts holds its raw calls and shapes). This file adapts its answers to the shapes the screens use,
 * and keeps the signed-in session. Map suggestions and restaurants come straight from OpenStreetMap (osm.ts).
 */
import * as osm from "./osm";
import * as team from "./teamApi";
import type {
  AccountRole, Booking, BookingStatus, Bounds, Comment, Cuisine, GuideProfileIn, Itinerary, ItineraryItem, ItinerarySummary,
  Meal, MealDiet, Progress, Role, SignupRequest, StopFields, Transport, TripPreferences, User,
} from "./types";

export class ApiError extends Error {
  /** `detail` is the server's own explanation, when it sent one as text. */
  constructor(public status: number, public detail = "") {
    super(`request failed: ${status}`);
  }
}

// ---------- the signed-in session (AuthContext owns it; it lives here so every request can attach it)

const TOKEN_KEY = "accessitour-token";
let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem("accessitour-token-source"); // left over from when there were two servers
} catch { /* storage blocked: stay signed out */ }
let onSignedOut = () => {};

export const hasToken = () => token !== null;
/** The session's token for the team API. */
export const teamToken = () => token;
export function setToken(next: string | null) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* still works for this tab */ }
}
/** Called when the server says the session is no longer valid (it expires after a day). */
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };
/** Runs a team-API call with the session, signing out if the server no longer accepts it. */
async function authed<T>(fn: (tok: string) => Promise<T>): Promise<T> {
  if (!token) throw new ApiError(401);
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) onSignedOut();
    throw e;
  }
}

// ---------- accounts

export interface Session { token: string; user: User }

export const getMe = (): Promise<User> => authed(async (tok) => {
  const me = await team.me(tok);
  return { id: me.id, email: me.email, display_name: me.full_name, role: me.role.toLowerCase() as AccountRole, guide_id: null };
});

export async function login(email: string, password: string): Promise<Session> {
  setToken(await team.login(email, password));
  return { token: token!, user: await getMe() };
}

/** A guide's profile is saved straight after the account is created. */
export async function signup(req: SignupRequest): Promise<Session> {
  await team.register(req.email, req.password, req.display_name, req.role);
  const access = await team.login(req.email, req.password);
  if (req.role === "guide" && req.guide) await team.saveGuideProfile(access, req.guide);
  setToken(access);
  return { token: access, user: await getMe() };
}

// ---------- the tourist's saved preferences (the tourist profile) and the guide's profile

/** Languages, mobility and food needs. Interests, budget and the number of travellers belong to each trip. */
export const getPreferences = (): Promise<TripPreferences> => authed(async (tok) => ({
  languages: ["en"], mobility: "normal", dietary: [], interests: [], budget_per_day: 120000, party_size: 1,
  ...(await team.getTouristPrefs(tok)),
}));
export const savePreferences = (prefs: TripPreferences) =>
  authed(async (tok) => { await team.saveTouristPrefs(tok, prefs); return prefs; });

export const getGuideProfile = () => authed((tok) => team.getGuideProfile(tok));
export const saveGuideProfile = (profile: GuideProfileIn) => authed((tok) => team.saveGuideProfile(tok, profile));

// ---------- bookings

const BOOKING_STATUS: Record<team.TeamBookingStatus, BookingStatus> = {
  REQUESTED: "pending", ACCEPTED: "accepted", ITINERARY_DRAFT: "accepted", IN_REVIEW: "accepted", CONFIRMED: "accepted",
  COMPLETED: "completed", DECLINED: "declined", CANCELLED: "cancelled",
};
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;

/** A booking in the shape the booking screens use. Once accepted, its itinerary is opened (created the first time). */
async function toBooking(tok: string, b: team.TeamBooking): Promise<Booking> {
  const status = BOOKING_STATUS[b.status];
  let itineraryId: number | null = null;
  if (status === "accepted" || status === "completed") {
    itineraryId = await team.openItinerary(tok, b.id).then((it) => it.id).catch(() => null); // listed without a link if this fails
  }
  return {
    id: b.id, status, owner_name: b.tourist.full_name, guide_id: b.guide.id, guide_name: b.guide.full_name, guide_name_ko: "",
    trip: {
      region: b.region.toLowerCase(), start_date: b.start_date, end_date: b.end_date, party_size: b.group_size,
      languages: [b.tourist.preferred_language], budget_per_day: Math.round(b.total_price / days(b.start_date, b.end_date)),
      mobility: team.MOBILITY_FROM_TEAM[b.tourist.mobility_level] ?? "normal", interests: [], dietary: [], religious: [], notes: "",
    },
    score: null, created_at: b.created_at, itinerary_id: itineraryId,
    team: { trip_id: b.trip_id, segment_id: b.segment_id, total_price: b.total_price },
  };
}

export const listBookings = () => authed(async (tok) => Promise.all((await team.myBookings(tok)).map((b) => toBooking(tok, b))));
export const decideBooking = (id: number, action: "accept" | "decline" | "cancel") =>
  authed(async (tok) => toBooking(tok, await team.bookingAction(tok, id, action)));
/** Asks a guide to take one segment (city) of a trip. */
export const requestTeamBooking = (segmentId: number, guideId: number) =>
  authed(async (tok) => toBooking(tok, await team.createBooking(tok, segmentId, guideId)));

// ---------- itineraries
// The team API stores dates and start/end times; the screens think in trip days, a start time and a visit length.

const hhmm = (t: string) => t.slice(0, 5);
const addMinutes = (start: string, min: number) => {
  const total = Math.min(23 * 60 + 59, +start.slice(0, 2) * 60 + +start.slice(3, 5) + min);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const minutesBetween = (a: string, b: string) => (+b.slice(0, 2) * 60 + +b.slice(3, 5)) - (+a.slice(0, 2) * 60 + +a.slice(3, 5));
const dayOf = (start: string, date: string) => days(start, date);
const dateOf = (start: string, day: number) => {
  const d = new Date(`${start}T00:00`);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString("sv");
};
const TRANSPORT_OUT: Record<Exclude<Transport, "">, team.TeamTransport> = { transit: "TRANSIT", walk: "WALK", car: "CAR", bicycle: "BICYCLE" };
const sideOf = (who: "TOURIST" | "GUIDE"): Role => (who === "TOURIST" ? "tourist" : "guide");

function toItinerary(it: team.TeamItinerary): Itinerary {
  const comment = (c: team.TeamComment): Comment => ({ author: sideOf(c.author), body: c.body, created_at: c.created_at });
  const items: ItineraryItem[] = it.items.map((i) => ({
    id: i.id, day_number: dayOf(it.start_date, i.date), start_time: hhmm(i.start_time),
    place_name: i.place_name, activity: i.activity ?? "", lat: i.latitude, lng: i.longitude,
    meal: i.meal ? (i.meal.toLowerCase() as Meal) : null,
    status: i.edited_by === "AI" ? "ai_draft" : "edited", progress: i.progress.toLowerCase() as Progress,
    duration_min: Math.max(0, minutesBetween(hhmm(i.start_time), hhmm(i.end_time))),
    transport: (i.transport?.toLowerCase() ?? "") as Transport,
    needs_accessibility_check: i.needs_accessibility_check, version: 0,
    last_edited_by: i.edited_by === "AI" ? null : sideOf(i.edited_by),
    comments: it.comments.filter((c) => c.item_id === i.id).map(comment),
  }));
  return {
    id: it.id, booking_id: it.booking_id, owner_name: it.tourist.full_name, guide_id: it.guide.id,
    guide_name: it.guide.full_name, guide_name_ko: "",
    trip: {
      region: it.region.toLowerCase(), start_date: it.start_date, end_date: it.end_date, party_size: it.group_size,
      languages: [it.tourist.preferred_language], budget_per_day: 0,
      mobility: team.MOBILITY_FROM_TEAM[it.tourist.mobility_level] ?? "normal", interests: [], dietary: [], religious: [], notes: "",
    },
    source: "plan", days: days(it.start_date, it.end_date), accessibility_review: it.accessibility_review,
    approved_by_tourist: it.approved_by_tourist, approved_by_guide: it.approved_by_guide,
    items, messages: it.comments.filter((c) => c.item_id === null).map(comment),
  };
}

/** A stop as the team API takes it. Fields left out of `f` are left out here too. */
function stopOut(it: Itinerary, f: Partial<StopFields>, current?: ItineraryItem): Partial<team.TeamItemIn> {
  const out: Partial<team.TeamItemIn> = {};
  if (f.day_number !== undefined) out.date = dateOf(it.trip.start_date, f.day_number);
  if (f.place_name !== undefined) out.place_name = f.place_name;
  if (f.activity !== undefined) out.activity = f.activity;
  if (f.lat !== undefined) out.latitude = f.lat;
  if (f.lng !== undefined) out.longitude = f.lng;
  if (f.meal !== undefined) out.meal = f.meal ? (f.meal.toUpperCase() as team.TeamItemIn["meal"]) : null;
  if (f.transport !== undefined) out.transport = f.transport ? TRANSPORT_OUT[f.transport] : null;
  // a new start time or length both move the end time
  if (f.start_time !== undefined || f.duration_min !== undefined) {
    const start = f.start_time ?? current?.start_time ?? "09:00";
    out.start_time = start;
    out.end_time = addMinutes(start, f.duration_min ?? current?.duration_min ?? 0);
  }
  return out;
}

/** [] while the server has no itinerary endpoints yet (the deployed API before feature/itinerary-endpoints). */
const noneIfMissing = <T,>(e: unknown, empty: T): T => {
  if (e instanceof ApiError && e.status === 404) return empty;
  throw e;
};
export const listItineraries = () => authed(async (tok): Promise<ItinerarySummary[]> =>
  (await team.listItineraries(tok).catch((e) => noneIfMissing(e, []))).map((x) => ({
    id: x.id, plan_id: null, team_booking_id: x.booking_id, guide_name: x.guide_name, guide_name_ko: "",
    owner_name: x.tourist_name, region: x.region.toLowerCase(), start_date: x.start_date, end_date: x.end_date,
    stops: x.stops, approved_by_tourist: x.approved_by_tourist, approved_by_guide: x.approved_by_guide,
  })));
export const getItinerary = (id: number) => authed(async (tok) => toItinerary(await team.getItinerary(tok, id)));

// Each change returns the whole updated itinerary. The server knows from the account whether it is the tourist or guide.
export const addStop = (it: Itinerary, f: StopFields) =>
  authed(async (tok) => toItinerary(await team.addItem(tok, it.id, stopOut(it, f) as team.TeamItemIn)));
export const updateStop = (it: Itinerary, item: ItineraryItem, changes: Partial<StopFields> & { accessibility_checked?: boolean }) =>
  authed(async (tok) => {
    const { accessibility_checked, ...fields } = changes;
    if (accessibility_checked) return toItinerary(await team.checkItem(tok, it.id, item.id));
    return toItinerary(await team.updateItem(tok, it.id, item.id, stopOut(it, fields, item)));
  });
export const deleteStop = (it: Itinerary, itemId: number) => authed(async (tok) => toItinerary(await team.deleteItem(tok, it.id, itemId)));
/** Marks a stop as on the way, visited, skipped or back to upcoming. Not a change to the plan itself. */
export const setStopProgress = (it: Itinerary, itemId: number, progress: Progress) =>
  authed(async (tok) => toItinerary(await team.setProgress(tok, it.id, itemId, progress.toUpperCase() as team.TeamProgress)));
export const addComment = (it: Itinerary, itemId: number, body: string) =>
  authed(async (tok) => toItinerary(await team.addComment(tok, it.id, body, itemId)));
export const sendMessage = (it: Itinerary, body: string) => authed(async (tok) => toItinerary(await team.addComment(tok, it.id, body, null)));
export const approveItinerary = (it: Itinerary) => authed(async (tok) => toItinerary(await team.approve(tok, it.id)));

// ---------- map: OpenStreetMap, straight from the browser

/** Suggestions in the part of the map in view. Fails when the area is too large or the map servers are busy. */
export async function getRecommendations(it: Itinerary, bounds: Bounds) {
  const found = await osm.nearbyPlaces(it, bounds);
  if (!found) throw new ApiError(503);
  return found;
}
/** Restaurant choices for lunch or dinner on one day. `near` is used when the day has no stop on the map yet. */
export const getMealOptions = (it: Itinerary, day: number, meal: Meal, cuisines: Cuisine[], diets: MealDiet[], near?: { lat: number; lng: number }) =>
  osm.mealOptions(it, day, meal, cuisines, diets, near);

/** Best-effort name for a clicked map position, from OpenStreetMap's Nominatim. "" when unknown. */
export async function placeNameAt(lat: number, lng: number, lang: string): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}&accept-language=${lang}`,
      { signal: AbortSignal.timeout(4000) },
    );
    const place = await res.json();
    return place.name || place.display_name?.split(",")[0] || "";
  } catch {
    return "";
  }
}
