import { describe, expect, it } from "vitest";
import { currentStop, overlapsNext, summarize } from "./progress";
import type { Progress } from "./types";

const stops = (...p: Progress[]) => p.map((progress, id) => ({ id, progress }));

describe("summarize", () => {
  it("is 0% for five stops with nothing visited", () => {
    expect(summarize(stops("upcoming", "upcoming", "upcoming", "upcoming", "upcoming")))
      .toMatchObject({ total: 5, visited: 0, remaining: 5, skipped: 0, percent: 0 });
  });
  it("matches the worked example: 2 visited, 1 on the way, 1 upcoming, 1 skipped", () => {
    expect(summarize(stops("visited", "visited", "on_the_way", "upcoming", "skipped")))
      .toEqual({ total: 5, visited: 2, skipped: 1, onTheWay: 1, upcoming: 1, remaining: 3, percent: 40 });
  });
  it("does not count skipped stops as visited", () => {
    expect(summarize(stops("skipped", "skipped")).percent).toBe(0);
  });
  it("is 0% with no stops, not a division error", () => {
    expect(summarize([])).toMatchObject({ total: 0, remaining: 0, percent: 0 });
  });
  it("rounds to a whole number and reaches 100%", () => {
    expect(summarize(stops("visited", "upcoming", "upcoming")).percent).toBe(33);
    expect(summarize(stops("visited", "visited", "upcoming")).percent).toBe(67);
    expect(summarize(stops("visited", "visited")).percent).toBe(100);
  });
});

describe("overlapsNext", () => {
  const stop = (start_time: string, duration_min = 0, day_number = 1) => ({ day_number, start_time, duration_min });
  it("flags a visit that runs past the next stop's start", () => {
    expect(overlapsNext(stop("10:00", 120), stop("11:30"))).toBe(true);
    expect(overlapsNext(stop("10:00", 90), stop("11:30"))).toBe(false); // ends exactly as the next begins
  });
  it("says nothing without a length, a next stop, or on different days", () => {
    expect(overlapsNext(stop("10:00"), stop("10:05"))).toBe(false);
    expect(overlapsNext(stop("10:00", 600), undefined)).toBe(false);
    expect(overlapsNext(stop("22:00", 180, 1), stop("09:00", 0, 2))).toBe(false);
  });
});

describe("currentStop", () => {
  it("prefers the stop being travelled to, then the first one still to come", () => {
    expect(currentStop(stops("visited", "upcoming", "on_the_way"))!.id).toBe(2);
    expect(currentStop(stops("visited", "skipped", "upcoming"))!.id).toBe(2);
    expect(currentStop(stops("visited", "skipped"))).toBeNull();
  });
});
