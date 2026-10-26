/**
 * Real places from OpenStreetMap, asked for straight from the browser (Overpass API, no key needed):
 * suggestions for the part of the map in view, and restaurants for lunch or dinner near the day's stops.
 * Each public Overpass server is often busy, so the next one is tried when one fails.
 */
import type { Bounds, Itinerary, Meal, MealDiet, Cuisine, MealOptions, Recommendation, Recommendations, TouristProfile } from "./types";

const OVERPASS_URLS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];
const MAX_SPAN_DEG = 1.5; // wider than this (several cities) is too slow to ask about
const MAX_RESULTS = 8;

interface OsmElement { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const cache = new Map<string, OsmElement[]>(); // so repeating a search doesn't ask a server again
let preferred = 0; // the server that answered last is tried first

/** null when every server failed. */
async function fetchOsm(query: string): Promise<OsmElement[] | null> {
  const hit = cache.get(query);
  if (hit) return hit;
  for (let step = 0; step < OVERPASS_URLS.length; step++) {
    const index = (preferred + step) % OVERPASS_URLS.length;
    try {
      const res = await fetch(OVERPASS_URLS[index], {
        method: "POST", body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const elements: OsmElement[] = (await res.json()).elements ?? [];
      cache.set(query, elements);
      preferred = index;
      return elements;
    } catch { /* busy or unreachable: try the next server */ }
  }
  return null;
}

const position = (el: OsmElement) => (el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : el.center);
/** `name` is the local (Korean) name; other languages fall back to English before it. */
const nameIn = (tags: Record<string, string>, lang: string) =>
  tags[`name:${lang}`] || (lang === "ko" ? undefined : tags["name:en"]) || tags.name;

// (tag, value or null for any) -> (matching interests, what to do there). First match wins.
const KINDS: [string, string | null, string[], string][] = [
  ["tourism", "museum", ["history", "culture"], "Visit the museum"],
  ["tourism", "gallery", ["culture"], "See the gallery"],
  ["amenity", "marketplace", ["food"], "Browse the market and try local food"],
  ["tourism", "viewpoint", ["nature"], "Take in the view"],
  ["leisure", "park", ["nature"], "Walk in the park"],
  ["tourism", "theme_park", [], "Spend time at the theme park"],
  ["tourism", "zoo", ["nature"], "Visit the zoo"],
  ["tourism", "aquarium", ["nature"], "Visit the aquarium"],
  ["historic", null, ["history", "culture"], "See this historic site"],
  ["tourism", "attraction", ["culture"], "Visit this local attraction"],
];

/** Places to add in the part of the map in view: well-known ones and the traveller's interests first. */
export async function nearbyPlaces(it: Itinerary, b: Bounds): Promise<Recommendations | null> {
  if (b.north - b.south > MAX_SPAN_DEG || b.east - b.west > MAX_SPAN_DEG) return null;
  const box = `(${b.south},${b.west},${b.north},${b.east})`;
  const elements = await fetchOsm(
    "[out:json][timeout:12];(" +
    `nwr["tourism"~"^(attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium)$"]["name"]${box};` +
    `nwr["historic"]["name"]["wikidata"]${box};nwr["leisure"="park"]["name"]["wikidata"]${box};` +
    `nwr["amenity"="marketplace"]["name"]${box};);out center tags 300;`,
  );
  if (!elements) return null;
  const p = it.trip;
  const wanted = new Set(p.interests);
  const scored = new Map<string, [number, Recommendation]>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const pos = position(el);
    const kind = KINDS.find(([tag, value]) => tag in tags && (value === null || tags[tag] === value));
    const name = nameIn(tags, p.languages[0]);
    if (!kind || !name || !pos) continue;
    if (p.mobility === "wheelchair" && tags.wheelchair === "no") continue;
    let score = 2 * Number("wikidata" in tags || "wikipedia" in tags) + kind[2].filter((x) => wanted.has(x)).length;
    if (p.mobility !== "normal" && tags.wheelchair === "yes") score += 1;
    if (!scored.has(name) || score > scored.get(name)![0]) scored.set(name, [score, { place_name: name, activity: kind[3], lat: pos.lat, lng: pos.lon }]);
  }
  const taken = new Set(it.items.map((i) => i.place_name.toLowerCase()));
  const places = [...scored.values()].sort((a, c) => c[0] - a[0]).map(([, r]) => r)
    .filter((r) => !taken.has(r.place_name.toLowerCase())).slice(0, MAX_RESULTS);
  return { source: "osm", places };
}

// ---------- restaurants for lunch and dinner

const MEAL_WINDOWS: Record<Meal, [number, number, number]> = { lunch: [690, 720, 810], dinner: [1050, 1080, 1170] }; // earliest, usual, latest
const MEAL_GAP_MIN = 60; // keep this long clear of the neighbouring stops when possible
const RADIUS_M = 1500;
const DIET_RADIUS_M = 6000; // few places are tagged with a diet, so look further and list nearest first
const HALAL_NAME = "halal|할랄"; // many halal places say so in their name instead of the diet:halal tag
const CUISINE_TAGS: Record<Cuisine, string> = {
  korean: "korean|bibimbap|barbecue|korean_bbq|noodle|gimbap|kimchi",
  chinese: "chinese|dumpling|jajangmyeon|hotpot",
  japanese: "japanese|sushi|ramen|udon|tonkatsu",
  western: "italian|pizza|pasta|burger|american|french|steak_house|steak|spanish|mexican",
  seafood: "seafood|fish|sashimi|crab",
};
const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

/** A half-hour slot in the meal window that sits between the day's other stops. */
export function mealTime(it: Itinerary, day: number, meal: Meal): string {
  const [lo, ideal, hi] = MEAL_WINDOWS[meal];
  const taken = it.items.filter((i) => i.day_number === day).map((i) => minutes(i.start_time));
  const clearance = (t: number) => Math.min(24 * 60, ...taken.map((x) => Math.abs(t - x)));
  const slots: number[] = [];
  for (let t = lo; t <= hi; t += 30) slots.push(t);
  slots.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
  const best = slots.find((t) => clearance(t) >= MEAL_GAP_MIN) ?? slots.reduce((a, b) => (clearance(b) > clearance(a) ? b : a));
  return `${String(Math.floor(best / 60)).padStart(2, "0")}:${String(best % 60).padStart(2, "0")}`;
}

const km = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

function restaurantQuery(lat: number, lng: number, cuisines: Cuisine[], diets: MealDiet[]): string {
  let base = '["name"]';
  if (cuisines.length) base += `["cuisine"~"${cuisines.map((c) => CUISINE_TAGS[c]).join("|")}",i]`;
  for (const d of diets) if (d !== "halal") base += `["diet:${d}"~"^(yes|only)$"]`;
  const variants = diets.includes("halal") ? [`${base}["diet:halal"~"^(yes|only)$"]`, `${base}["name"~"${HALAL_NAME}",i]`] : [base];
  const around = `(around:${diets.length ? DIET_RADIUS_M : RADIUS_M},${lat},${lng})`;
  return "[out:json][timeout:12];(" + variants.map((v) => `nwr["amenity"="restaurant"]${v}${around};`).join("") + ");out center tags 80;";
}

/**
 * Restaurants for lunch or dinner on one day, nearest to the stop before the meal (or the next one, or `near`).
 * source "none" = nowhere to search from, or every map server failed.
 */
export async function mealOptions(
  it: Itinerary, day: number, meal: Meal, cuisines: Cuisine[], diets: MealDiet[], near?: { lat: number; lng: number },
): Promise<MealOptions> {
  const at = mealTime(it, day, meal);
  const placed = it.items.filter((i) => i.day_number === day && i.lat !== null && i.lng !== null);
  const before = placed.filter((i) => i.start_time <= at);
  const stop = before[before.length - 1] ?? placed[0];
  const anchor = stop ? { lat: stop.lat!, lng: stop.lng! } : near;
  if (!anchor) return { source: "none", start_time: at, places: [] };
  const elements = await fetchOsm(restaurantQuery(anchor.lat, anchor.lng, cuisines, diets));
  if (!elements) return { source: "none", start_time: at, places: [] };
  const p: TouristProfile = it.trip;
  const found = new Map<string, [number, Recommendation]>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const pos = position(el);
    const name = nameIn(tags, p.languages[0]);
    if (!name || !pos) continue;
    if (p.mobility === "wheelchair" && tags.wheelchair === "no") continue;
    const kinds = (tags.cuisine ?? "").split(";").filter(Boolean).slice(0, 2).map((c) => c.replace(/_/g, " "));
    const halalByName = new RegExp(HALAL_NAME, "i").test(Object.entries(tags).filter(([k]) => k.startsWith("name")).map(([, v]) => v).join(" "));
    for (const d of ["halal", "vegan", "vegetarian"]) {
      if (["yes", "only"].includes(tags[`diet:${d}`]) || (d === "halal" && halalByName)) kinds.push(d);
    }
    const dist = km(anchor.lat, anchor.lng, pos.lat, pos.lon);
    let activity = meal[0].toUpperCase() + meal.slice(1) + (kinds.length ? `: ${kinds.join(", ")}` : "");
    if (dist >= 1) activity += ` · about ${dist.toFixed(1)} km from your previous stop`;
    if (!found.has(name) || dist < found.get(name)![0]) found.set(name, [dist, { place_name: name, activity, lat: pos.lat, lng: pos.lon }]);
  }
  const taken = new Set(it.items.map((i) => i.place_name.toLowerCase()));
  const places = [...found.values()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)
    .filter((r) => !taken.has(r.place_name.toLowerCase())).slice(0, MAX_RESULTS);
  return { source: "osm", start_time: at, places };
}
