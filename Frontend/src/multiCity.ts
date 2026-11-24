/** Multi-city trips: the outline of cities and dates. Pure functions, tested in multiCity.test.ts. */
import type { TeamSegmentIn } from "./teamApi";
import type { Transfer, TripLeg } from "./types";

export const MAX_LEGS = 5; // same limit as the backend

/** Days in a stay, counting both the arrival and the departure day. 0 when the dates are missing or reversed. */
export function stayDays(leg: Pick<TripLeg, "start_date" | "end_date">): number {
  if (!leg.start_date || !leg.end_date || leg.end_date < leg.start_date) return 0;
  return Math.round((Date.parse(leg.end_date) - Date.parse(leg.start_date)) / 864e5) + 1;
}

export type LegError = "noDates" | "reversed" | "beforePrevious" | "outsideTrip";
/**
 * The first problem with the cities' dates, as [which city, what is wrong], or null when they work.
 * Arriving on the day you leave the previous city is fine: that is the travel day.
 */
export function checkLegs(legs: TripLeg[], tripStart: string, tripEnd: string): [number, LegError] | null {
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg.start_date || !leg.end_date) return [i, "noDates"];
    if (leg.end_date < leg.start_date) return [i, "reversed"];
    if (leg.start_date < tripStart || leg.end_date > tripEnd) return [i, "outsideTrip"];
    if (i > 0 && leg.start_date < legs[i - 1].end_date) return [i, "beforePrevious"];
  }
  return null;
}

/** Moves the city at `from` one place up (-1) or down (+1). Out-of-range moves return the list unchanged. */
export function moveLeg<T>(legs: T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= legs.length) return legs;
  const next = [...legs];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

const ISLAND = new Set(["jeju", "seogwipo"]); // no road or rail to the mainland
/** Ways of getting between two cities that can exist at all. Whether one runs on a given day is not known here. */
export function transferModes(from: string, to: string): Exclude<Transfer, "">[] {
  const a = ISLAND.has(from), b = ISLAND.has(to);
  if (a && b) return ["bus", "car"];
  if (a || b) return ["flight", "ferry"];
  return ["train", "bus", "car", "flight"];
}

/** Where to look up timetables and tickets. Operators' own sites; AccessiTour does not read schedules from them. */
export const TRANSFER_INFO: Partial<Record<Transfer, { name: string; url: string }>> = {
  train: { name: "Korail", url: "https://www.korail.com" },
  bus: { name: "Kobus", url: "https://www.kobus.co.kr" },
  flight: { name: "Korea Airports Corporation", url: "https://www.airport.co.kr" },
};


/** How long the tourist wants a guide: whole days, or a few hours each day. */
export type GuideService = { kind: "FULL_DAY" } | { kind: "MICRO"; start: string; end: string };

/** Every date from `from` to `to`, inclusive (YYYY-MM-DD). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00`); d <= new Date(`${to}T00:00`); d.setDate(d.getDate() + 1)) out.push(d.toLocaleDateString("sv"));
  return out;
}

/**
 * The team API's trip segments for the stays. Full days: one segment per city, budgeted for the whole stay.
 * A few hours: the team API books short sessions one day at a time, so each day of each stay is its own segment.
 */
export function buildSegments(
  stays: TripLeg[], service: GuideService, groupSize: number, attributes: string[], budgetPerDay: number,
): TeamSegmentIn[] {
  const base = { group_size: groupSize, attributes };
  if (service.kind === "FULL_DAY") {
    return stays.map((s) => ({
      ...base, region: s.region.toUpperCase(), service_type: "FULL_DAY", start_date: s.start_date, end_date: s.end_date,
      budget: budgetPerDay * stayDays(s),
    }));
  }
  return stays.flatMap((s) => datesBetween(s.start_date, s.end_date).map((day) => ({
    ...base, region: s.region.toUpperCase(), service_type: "MICRO" as const, start_date: day, end_date: day,
    start_time: service.start, end_time: service.end, budget: budgetPerDay,
  })));
}
