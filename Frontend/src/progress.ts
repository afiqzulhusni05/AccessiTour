/** Trip progress and schedule checks. Pure functions, so they can be tested on their own. */
import type { Progress } from "./types";

export const STATES: Progress[] = ["upcoming", "on_the_way", "visited", "skipped"];

export interface Summary {
  total: number;
  visited: number;
  skipped: number;
  onTheWay: number;
  upcoming: number;
  /** Stops still to go: upcoming and on the way. Visited + remaining + skipped = total. */
  remaining: number;
  /** Whole-number share of stops visited. Skipped stops do not count as visited. */
  percent: number;
}

export function summarize(items: { progress: Progress }[]): Summary {
  const n = (p: Progress) => items.filter((i) => i.progress === p).length;
  const total = items.length;
  const visited = n("visited");
  return {
    total, visited, skipped: n("skipped"), onTheWay: n("on_the_way"), upcoming: n("upcoming"),
    remaining: n("upcoming") + n("on_the_way"), // still to go; skipped stops are counted on their own
    percent: total === 0 ? 0 : Math.round((visited / total) * 100),
  };
}

/** The stop to show as "now": the one the traveller is heading to, otherwise the first one still to come. */
export function currentStop<T extends { progress: Progress }>(items: T[]): T | null {
  return items.find((i) => i.progress === "on_the_way") ?? items.find((i) => i.progress === "upcoming") ?? null;
}

export const VISIT_PRESETS = [30, 60, 90, 120, 180]; // minutes
export const MAX_VISIT_MIN = 720; // same limit as the backend

const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

interface Timed { day_number: number; start_time: string; duration_min: number }
/**
 * True when a visit is planned to last past the start of the next stop on the same day.
 * Travel time between the two is unknown, so this only catches plans that cannot work even with none.
 */
export function overlapsNext(stop: Timed, next: Timed | undefined): boolean {
  if (!next || stop.duration_min <= 0 || next.day_number !== stop.day_number) return false;
  return minutes(stop.start_time) + stop.duration_min > minutes(next.start_time);
}


const DAY_START = 10 * 60; // a day with no stops starts at 10:00
const LATEST = 22 * 60;
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * When a stop added to a day should start: half an hour-aligned, after the day's last stop ends
 * (a stop without a length counts as one hour). 10:00 on an empty day; never later than 22:00.
 */
export function nextFreeTime(dayStops: { start_time: string; duration_min: number }[]): string {
  if (dayStops.length === 0) return toHhmm(DAY_START);
  const ends = dayStops.map((s) => minutes(s.start_time) + (s.duration_min > 0 ? s.duration_min : 60));
  const after = Math.ceil(Math.max(...ends) / 30) * 30;
  return toHhmm(Math.min(after, LATEST));
}
