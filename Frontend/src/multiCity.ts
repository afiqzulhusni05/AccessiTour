/** Multi-city trips: the outline of cities and dates. Pure functions, tested in multiCity.test.ts. */
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
