import type {
  Booking, Bounds, Cuisine, Guide, GuideProfileIn, Itinerary, ItineraryItem, ItinerarySummary, MatchLogEntry,
  MatchResult, Meal, MealDiet, MealOptions, Recommendations, Session, SignupRequest, StopFields, TouristProfile,
  Progress, Transfer, TripLeg, TripPlan, TripPreferences, User,
} from "./types";
import * as team from "./teamApi";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`request failed: ${status}`);
  }
}

// The signed-in session. AuthContext owns it; it lives here so every request can attach it.
// "team" = signed in through the team's deployed API (tourists and guides); "local" = an account that only
// exists in the local backend (the admin, the sample guides' demo logins). The local backend accepts both.
export type TokenSource = "team" | "local";
const TOKEN_KEY = "accessitour-token";
const SOURCE_KEY = "accessitour-token-source";
let token: string | null = null;
let source: TokenSource = "local";
try {
  token = localStorage.getItem(TOKEN_KEY);
  source = localStorage.getItem(SOURCE_KEY) === "team" ? "team" : "local";
} catch { /* storage blocked: stay signed out */ }
let onSignedOut = () => {};

export const hasToken = () => token !== null;
/** The team API token, when the session came from there. */
export const teamToken = () => (source === "team" ? token : null);
export function setToken(next: string | null, from: TokenSource = "local") {
  token = next;
  source = from;
  try {
    if (next) {
      localStorage.setItem(TOKEN_KEY, next);
      localStorage.setItem(SOURCE_KEY, from);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SOURCE_KEY);
    }
  } catch { /* still works for this tab */ }
}
/** Called when the server says the session is no longer valid (expired, or the account was removed). */
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

async function send<T = Itinerary>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  if (res.status === 401 && token && !path.startsWith("/auth/log")) onSignedOut();
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

// Accounts
export interface SignedIn extends Session { source: TokenSource }

/** Asks the local backend who a team-API token belongs to. This is also what tells it the account exists. */
async function adopt(teamAccessToken: string): Promise<SignedIn> {
  setToken(teamAccessToken, "team");
  return { token: teamAccessToken, source: "team", user: await send<User>("POST", "/auth/sync") };
}

/** New tourists and guides are created in the team API; a guide's profile is saved there right away. */
export async function signup(req: SignupRequest): Promise<SignedIn> {
  await team.register(req.email, req.password, req.display_name, req.role);
  const access = await team.login(req.email, req.password);
  if (req.role === "guide" && req.guide) await team.saveGuideProfile(access, req.guide);
  return adopt(access);
}

/** Team API first; the admin and the sample guides only exist in the local backend, so try that next. */
export async function login(email: string, password: string): Promise<SignedIn> {
  try {
    return await adopt(await team.login(email, password));
  } catch (e) {
    // 401 = not a team account (or wrong password); 422 = an address the team API won't accept, like *.test
    if (!(e instanceof ApiError && [401, 404, 422].includes(e.status))) throw e;
  }
  const session = await send<Session>("POST", "/auth/login", { email, password });
  return { ...session, source: "local" };
}

/** Only accounts registered in the local backend can change these; the team API has no endpoint for it yet. */
export const canEditAccount = (u: User) => teamToken() === null && u.id >= 10_000; // smaller ids: admin and sample guides
export const updateAccount = (displayName: string, email: string, currentPassword: string) =>
  send<User>("PUT", "/me/account", { display_name: displayName, email, current_password: currentPassword });
export const getMe = () => send<User>("GET", "/auth/me");
/** Re-reads the account from the team API, for example after a guide creates or edits their profile. */
export const syncMe = () => send<User>("POST", "/auth/sync");
export const logout = () => (source === "local" ? send<{ ok: boolean }>("POST", "/auth/logout") : Promise.resolve({ ok: true }));
export const listUsers = () => send<User[]>("GET", "/admin/users");
export const deleteUser = (id: number) => send<User[]>("DELETE", `/admin/users/${id}`);
/** The tourist's own trips, the guide's assigned trips, or all of them for the admin. */
export const listItineraries = () => send<ItinerarySummary[]>("GET", "/itineraries");

export const listGuides = () => send<Guide[]>("GET", "/guides");

export const matchGuides = (profile: TouristProfile, signal?: AbortSignal, topK = 10) =>
  send<MatchResult[]>("POST", `/match?top_k=${topK}`, profile, signal);

// Multi-city trip plans: the outline only. Each city is booked through the normal flow with plan_id set.
export const createPlan = (legs: TripLeg[], prefs: TripPreferences) => send<TripPlan>("POST", "/plans", { legs, prefs });
export const listPlans = () => send<TripPlan[]>("GET", "/plans");
export const getPlan = (id: number) => send<TripPlan>("GET", `/plans/${id}`);
export const setTransfers = (id: number, transfers: Transfer[]) => send<TripPlan>("PUT", `/plans/${id}/transfers`, { transfers });

// Bookings: the tourist asks a guide; the itinerary is created when the guide accepts.
export const requestBooking = (profile: TouristProfile, guideId: number) =>
  send<Booking>("POST", "/bookings", { profile, guide_id: guideId });
/** The tourist's own requests, the requests sent to the guide, or all of them for the admin. */
export const listBookings = () => send<Booking[]>("GET", "/bookings");
export const decideBooking = (id: number, action: "accept" | "decline" | "cancel") =>
  send<Booking>("POST", `/bookings/${id}/${action}`);

// The signed-in person's own settings
// Languages, mobility and food needs are part of the tourist profile in the team API; interests and budget are
// only known to the local backend. The screens see one object.
export async function getPreferences(): Promise<TripPreferences> {
  const access = teamToken();
  const [local, shared] = await Promise.all([
    send<TripPreferences>("GET", "/me/preferences"),
    access ? team.getTouristPrefs(access) : null,
  ]);
  return { ...local, ...shared };
}

export async function savePreferences(prefs: TripPreferences): Promise<TripPreferences> {
  const access = teamToken();
  if (access) await team.saveTouristPrefs(access, prefs);
  return send<TripPreferences>("PUT", "/me/preferences", prefs);
}

/** A team-API guide's own profile (null until they create it), and saving it. */
export const getGuideProfile = () => team.getGuideProfile(teamToken()!);
export async function saveGuideProfile(profile: GuideProfileIn): Promise<User> {
  await team.saveGuideProfile(teamToken()!, profile);
  return syncMe(); // so the local backend matches travellers against the new details
}
/** For a guide account that was registered in the local backend, before sign-up moved to the team API. */
export const saveLocalGuideProfile = (profile: GuideProfileIn, displayName: string, nameKo: string) =>
  send<Guide>("PUT", "/me/guide", { ...profile, display_name: displayName, name_ko: nameKo });

// Admin
export const listMatches = () => send<MatchLogEntry[]>("GET", "/admin/matches");
export const verifyGuideTag = (guideId: number, tag: string, verified: boolean) =>
  send<Guide>("POST", `/admin/guides/${guideId}/verify`, { tag, verified });

// Collaboration (plan 2.9). Each call returns the whole updated itinerary.
// The server works out whether the caller is the tourist or the guide from their account.
export const getItinerary = (id: number) => send("GET", `/itineraries/${id}`);
export const addStop = (id: number, fields: StopFields) => send("POST", `/itineraries/${id}/items`, fields);
export const updateStop = (
  id: number, item: ItineraryItem,
  changes: Partial<StopFields> & { accessibility_checked?: boolean },
) => send("PATCH", `/itineraries/${id}/items/${item.id}`, { version: item.version, ...changes });
export const deleteStop = (id: number, itemId: number) => send("DELETE", `/itineraries/${id}/items/${itemId}`);
/** Marks a stop as on the way, visited, skipped or back to upcoming. Not a change to the plan itself. */
export const setStopProgress = (id: number, itemId: number, progress: Progress) =>
  send("PUT", `/itineraries/${id}/items/${itemId}/progress`, { progress });
export const addComment = (id: number, itemId: number, body: string) =>
  send("POST", `/itineraries/${id}/items/${itemId}/comments`, { body });
export const sendMessage = (id: number, body: string) => send("POST", `/itineraries/${id}/messages`, { body });
export const approveItinerary = (id: number) => send("POST", `/itineraries/${id}/approve`);

// Map (plan 2.12 지도 API). Suggestions are limited to the part of the map the user is looking at.
export const getRecommendations = (id: number, bounds: Bounds) =>
  send<Recommendations>("POST", `/itineraries/${id}/recommendations`, bounds);

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

/** Restaurant choices for lunch or dinner on one day. `near` is used when the day has no stop on the map yet. */
export const getMealOptions = (
  id: number, day: number, meal: Meal, cuisines: Cuisine[], diets: MealDiet[], near?: { lat: number; lng: number },
) =>
  send<MealOptions>("POST", `/itineraries/${id}/meals`, {
    day_number: day, meal, cuisines, diets, near_lat: near?.lat, near_lng: near?.lng,
  });
