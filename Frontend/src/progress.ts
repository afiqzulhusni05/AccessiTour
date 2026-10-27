/** Trip progress and schedule checks. Pure functions, so they can be tested on their own. */
import type { Progress } from "./types";

export const STATES: Progress[] = ["upcoming", "on_the_way", "visited", "skipped"];

export interface Summary {
  total: number;
  visited: number;
  skipped: number;
  onTheWay: number;
  upcoming: number;
  /** Stops not visited, whatever the reason: upcoming, on the way and skipped. Always total - visited. */
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
    remaining: total - visited,
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
