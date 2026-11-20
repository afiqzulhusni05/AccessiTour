// Help near a point on the trip map: restrooms, restaurants and emergency hospitals, in one shape.
import { getNearbyHospitals, getNearbyRestaurants, getNearbyRestrooms } from "./api";
import i18n from "./i18n";

const t = (key: string, options?: Record<string, string | number>) => String(i18n.t(key, options));

export const KINDS = ["restrooms", "restaurants", "hospitals"] as const;
export type Kind = (typeof KINDS)[number];
export const PIN_TEXT: Record<Kind, string> = { restrooms: "WC", restaurants: "🍴", hospitals: "H" };

export interface NearbyPlace {
  key: string;
  name: string;
  lat: number;
  lng: number;
  details: string[]; // short lines shown under the name
  image: string | null;
  phone: string | null;
}

export async function loadNearby(kind: Kind, lat: number, lng: number, accessibleOnly: boolean): Promise<NearbyPlace[]> {
  const meters = (m: number | null) => (m == null ? null : t("near.meters", { m }));
  if (kind === "restrooms") {
    return (await getNearbyRestrooms(lat, lng, accessibleOnly)).map((r) => ({
      key: `wc-${r.id}`, name: r.name, lat: r.latitude, lng: r.longitude, image: null, phone: r.phone,
      details: [
        [meters(r.distance_m), r.accessible_toilets > 0 ? t("near.accessible", { count: r.accessible_toilets }) : t("near.noAccessible"),
          r.has_nursing_room ? t("near.nursing") : null].filter(Boolean).join(" · "),
        r.opening_hours ? t("near.hours", { hours: r.opening_hours }) : "",
        r.address_en ?? r.address ?? "",
      ].filter(Boolean),
    }));
  }
  if (kind === "restaurants") {
    return (await getNearbyRestaurants(lat, lng)).map((r) => ({
      key: `food-${r.content_id ?? r.name}`, name: r.name, lat: r.latitude, lng: r.longitude, image: r.thumbnail_url ?? r.image_url, phone: r.phone,
      details: [[meters(r.distance_m), r.cuisine].filter(Boolean).join(" · "), r.address ?? ""].filter(Boolean),
    }));
  }
  const { hospitals } = await getNearbyHospitals(lat, lng);
  return hospitals.map((h) => ({
    key: `er-${h.hpid ?? h.name}`, name: h.name, lat: h.latitude, lng: h.longitude, image: null, phone: h.phone,
    details: [[meters(h.distance_m), h.kind].filter(Boolean).join(" · "), h.address ?? ""].filter(Boolean),
  }));
}
