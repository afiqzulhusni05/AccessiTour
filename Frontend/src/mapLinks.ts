/**
 * Links that open an itinerary stop in Kakao Map. AccessiTour never calculates a route itself:
 * it builds a link, and Kakao Map does the rest. Formats from Kakao's own documentation
 * (https://apis.map.kakao.com/web/guide/, "URL로 지도 바로가기"); they work in any browser,
 * and on a phone Kakao offers to open its app. No API key is needed.
 */

export type TravelMode = "transit" | "walk" | "car" | "bicycle";
export const MODES: TravelMode[] = ["transit", "walk", "car", "bicycle"];

export interface Place { name: string; lat: number | null; lng: number | null }

const KAKAO = "https://map.kakao.com/link";
const KAKAO_MODE: Record<TravelMode, string> = { transit: "traffic", walk: "walk", car: "car", bicycle: "bicycle" };

/** Korea's latitude and longitude range. Anything else is treated as "no position". */
export function hasCoords(p: Place): p is Place & { lat: number; lng: number } {
  return typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= 31.43 && p.lat <= 44.35 && p.lng >= 122.37 && p.lng <= 132.0;
}

const clean = (name: string) => name.replace(/\s+/g, " ").trim();
/** Kakao separates name, latitude and longitude with commas and path parts with slashes, so a name can hold neither. */
const point = (p: Place & { lat: number; lng: number }) =>
  `${encodeURIComponent(clean(p.name).replace(/[,/]/g, " ") || "Destination")},${p.lat},${p.lng}`;

/** Searches Kakao Map by name; `near` (a city) narrows the results. null without a usable name. */
export function searchLink(place: Place, near = ""): string | null {
  const name = clean(place.name);
  return name ? `${KAKAO}/search/${encodeURIComponent(clean(`${name} ${near}`))}` : null;
}

/** Shows the place on Kakao Map, or searches for it by name when it has no position. */
export function showLink(place: Place, near = ""): string | null {
  return hasCoords(place) ? `${KAKAO}/map/${point(place)}` : searchLink(place, near);
}

/**
 * Route search to `to`. With a `from` that has a position, Kakao Map opens with both filled in
 * (and with `mode` preselected when given); without one, Kakao starts from the person's own location.
 * null when the destination has no position.
 */
export function directionsLink(to: Place, from?: Place, mode?: TravelMode): string | null {
  if (!hasCoords(to)) return null;
  if (!from || !hasCoords(from)) return `${KAKAO}/to/${point(to)}`;
  return mode ? `${KAKAO}/by/${KAKAO_MODE[mode]}/${point(from)}/${point(to)}` : `${KAKAO}/from/${point(from)}/to/${point(to)}`;
}
