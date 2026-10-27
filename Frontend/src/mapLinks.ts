/**
 * Links that hand an itinerary stop over to Naver Map or Kakao Map.
 *
 * AccessiTour never calculates a route itself: it only builds a link, and the map service does the rest.
 * Every URL format here comes from the providers' own documentation:
 *   Naver Map URL scheme (app only)   https://guide.ncloud-docs.com/docs/en/maps-url-scheme
 *   Kakao Map web links (any browser) https://apis.map.kakao.com/web/guide/  ("URL로 지도 바로가기")
 * The one exception is NAVER_WEB_SEARCH, used only where the Naver app cannot run (a computer).
 * No API key is needed for any of these.
 */

export type MapProvider = "naver" | "kakao";
export type TravelMode = "transit" | "walk" | "car" | "bicycle";
export type Platform = "android" | "ios" | "desktop";

export const PROVIDERS: MapProvider[] = ["naver", "kakao"];
/** Both providers document all four for route search. */
export const MODES: TravelMode[] = ["transit", "walk", "car", "bicycle"];

export interface Place { name: string; lat: number | null; lng: number | null }

export interface MapLink {
  url: string;
  /** What the link does: show the spot, search for it by name, find a route, or start turn-by-turn driving. */
  kind: "place" | "search" | "route" | "navigation";
  /** True when the link only works with the provider's phone app installed. */
  needsApp: boolean;
}

export interface Env {
  platform: Platform;
  /** Naver requires an `appname` on every URL; for a website it is the page's address. */
  appName: string;
}

const NAVER_MODE: Record<TravelMode, string> = { transit: "public", walk: "walk", car: "car", bicycle: "bicycle" };
const KAKAO_MODE: Record<TravelMode, string> = { transit: "traffic", walk: "walk", car: "car", bicycle: "bicycle" };
const NAVER_ANDROID_PACKAGE = "com.nhn.android.nmap";
export const NAVER_IOS_STORE = "https://itunes.apple.com/app/id311867728?mt=8"; // from Naver's documentation
const NAVER_WEB_SEARCH = "https://map.naver.com/p/search/"; // the Naver Map website; not part of the URL scheme document
const KAKAO = "https://map.kakao.com/link";

// The range Naver documents for coordinates (it covers the Korean peninsula). Anything else is treated as "no position".
export function hasCoords(p: Place): p is Place & { lat: number; lng: number } {
  return typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= 31.43 && p.lat <= 44.35 && p.lng >= 122.37 && p.lng <= 132.0;
}

const clean = (name: string) => name.replace(/\s+/g, " ").trim();
/** Kakao separates name, latitude and longitude with commas and path parts with slashes, so a name can hold neither. */
const kakaoPoint = (p: Place & { lat: number; lng: number }) =>
  `${encodeURIComponent(clean(p.name).replace(/[,/]/g, " ") || "Destination")},${p.lat},${p.lng}`;

/** An nmap:// address. On Android it is wrapped in an intent, which sends people to the Play Store if the app is missing. */
function naverApp(action: string, params: Record<string, string | number>, env: Env): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));
  query.set("appname", env.appName);
  const rest = `${action}?${query.toString().replace(/\+/g, "%20")}`;
  return env.platform === "android"
    ? `intent://${rest}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${NAVER_ANDROID_PACKAGE};end`
    : `nmap://${rest}`;
}

/** Looks the stop up by name, for when it has no usable position. `near` (a city name) narrows the results. */
export function searchLink(provider: MapProvider, place: Place, env: Env, near = ""): MapLink | null {
  const name = clean(place.name);
  if (!name) return null;
  const query = clean(`${name} ${near}`);
  if (provider === "kakao") return { url: `${KAKAO}/search/${encodeURIComponent(query)}`, kind: "search", needsApp: false };
  if (env.platform === "desktop") return { url: NAVER_WEB_SEARCH + encodeURIComponent(query), kind: "search", needsApp: false };
  return { url: naverApp("search", { query }, env), kind: "search", needsApp: true };
}

/** Shows the stop on the provider's map. Falls back to a name search when the stop has no position. */
export function placeLink(provider: MapProvider, place: Place, env: Env, near = ""): MapLink | null {
  if (!hasCoords(place)) return searchLink(provider, place, env, near);
  if (provider === "kakao") return { url: `${KAKAO}/map/${kakaoPoint(place)}`, kind: "place", needsApp: false };
  if (env.platform === "desktop") return searchLink(provider, place, env, near); // the Naver scheme has no web form
  return { url: naverApp("place", { lat: place.lat, lng: place.lng, name: clean(place.name) || "Destination" }, env), kind: "place", needsApp: true };
}

/**
 * Opens route search to the stop. Without `from`, the map service starts from the person's own location.
 * Returns null when the destination has no position (use searchLink instead) or the provider cannot do it here.
 */
export function routeLink(provider: MapProvider, to: Place, mode: TravelMode, env: Env, from?: Place): MapLink | null {
  if (!hasCoords(to)) return null;
  const start = from && hasCoords(from) ? from : null;
  if (provider === "kakao") {
    // Kakao's link with a travel mode needs both ends; "to" alone lets the person pick the mode in Kakao Map.
    const url = start ? `${KAKAO}/by/${KAKAO_MODE[mode]}/${kakaoPoint(start)}/${kakaoPoint(to)}` : `${KAKAO}/to/${kakaoPoint(to)}`;
    return { url, kind: "route", needsApp: false };
  }
  if (env.platform === "desktop") return null;
  const params: Record<string, string | number> = {};
  if (start) Object.assign(params, { slat: start.lat, slng: start.lng, sname: clean(start.name) });
  Object.assign(params, { dlat: to.lat, dlng: to.lng, dname: clean(to.name) });
  return { url: naverApp(`route/${NAVER_MODE[mode]}`, params, env), kind: "route", needsApp: true };
}

/** Turn-by-turn driving from the person's location. Only Naver documents a link for it, and only in its phone app. */
export function navigationLink(provider: MapProvider, to: Place, env: Env): MapLink | null {
  if (provider !== "naver" || env.platform === "desktop" || !hasCoords(to)) return null;
  return { url: naverApp("navigation", { dlat: to.lat, dlng: to.lng, dname: clean(to.name) }, env), kind: "navigation", needsApp: true };
}

export function detectPlatform(userAgent: string, touchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS introduces itself as a Mac, but a Mac has no touch screen
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return "ios";
  return "desktop";
}
