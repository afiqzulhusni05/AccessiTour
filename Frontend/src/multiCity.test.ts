import { describe, expect, it } from "vitest";
import { buildSegments, checkLegs, datesBetween, moveLeg, stayDays, transferModes } from "./multiCity";

const leg = (region: string, start_date: string, end_date: string) => ({ region, start_date, end_date });
const trip = [leg("seoul", "2026-11-10", "2026-11-12"), leg("busan", "2026-11-12", "2026-11-14"), leg("jeju", "2026-11-15", "2026-11-17")];

describe("stayDays", () => {
  it("counts arrival and departure days", () => {
    expect(stayDays(trip[0])).toBe(3);
    expect(stayDays(leg("x", "2026-11-10", "2026-11-10"))).toBe(1);
  });
  it("is 0 for missing or reversed dates", () => {
    expect(stayDays(leg("x", "", "2026-11-10"))).toBe(0);
    expect(stayDays(leg("x", "2026-11-12", "2026-11-10"))).toBe(0);
  });
});

describe("checkLegs", () => {
  it("accepts cities in date order, including a shared travel day", () => {
    expect(checkLegs(trip, "2026-11-10", "2026-11-17")).toBeNull();
  });
  it("names the first city with a problem", () => {
    expect(checkLegs([trip[0], leg("busan", "", "")], "2026-11-10", "2026-11-17")).toEqual([1, "noDates"]);
    expect(checkLegs([leg("seoul", "2026-11-12", "2026-11-10")], "2026-11-10", "2026-11-17")).toEqual([0, "reversed"]);
    expect(checkLegs([trip[0], leg("busan", "2026-11-11", "2026-11-14")], "2026-11-10", "2026-11-17")).toEqual([1, "beforePrevious"]);
    expect(checkLegs(trip, "2026-11-10", "2026-11-16")).toEqual([2, "outsideTrip"]);
    expect(checkLegs(trip, "2026-11-11", "2026-11-17")).toEqual([0, "outsideTrip"]);
  });
});

describe("moveLeg", () => {
  it("swaps a city with its neighbour and ignores moves off the ends", () => {
    expect(moveLeg(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveLeg(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveLeg(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveLeg(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("transferModes", () => {
  it("offers only flight or ferry to and from Jeju", () => {
    expect(transferModes("busan", "jeju")).toEqual(["flight", "ferry"]);
    expect(transferModes("seogwipo", "seoul")).toEqual(["flight", "ferry"]);
  });
  it("offers land travel on the mainland and within Jeju", () => {
    expect(transferModes("seoul", "busan")).toEqual(["train", "bus", "car", "flight"]);
    expect(transferModes("jeju", "seogwipo")).toEqual(["bus", "car"]);
  });
});

describe("buildSegments", () => {
  const stays = [leg("seoul", "2026-11-10", "2026-11-11"), leg("busan", "2026-11-12", "2026-11-12")];
  it("makes one full-day segment per city, budgeted for the whole stay", () => {
    expect(buildSegments(stays, { kind: "FULL_DAY" }, 2, ["FOOD"], 100000)).toEqual([
      { region: "SEOUL", service_type: "FULL_DAY", start_date: "2026-11-10", end_date: "2026-11-11", group_size: 2, attributes: ["FOOD"], budget: 200000 },
      { region: "BUSAN", service_type: "FULL_DAY", start_date: "2026-11-12", end_date: "2026-11-12", group_size: 2, attributes: ["FOOD"], budget: 100000 },
    ]);
  });
  it("makes one short session per day, each with the times and a day's budget", () => {
    const segs = buildSegments(stays, { kind: "MICRO", start: "10:00", end: "14:00" }, 1, [], 80000);
    expect(segs.map((s) => [s.region, s.start_date, s.end_date, s.start_time, s.end_time, s.budget])).toEqual([
      ["SEOUL", "2026-11-10", "2026-11-10", "10:00", "14:00", 80000],
      ["SEOUL", "2026-11-11", "2026-11-11", "10:00", "14:00", 80000],
      ["BUSAN", "2026-11-12", "2026-11-12", "10:00", "14:00", 80000],
    ]);
    expect(segs.every((s) => s.service_type === "MICRO")).toBe(true);
  });
  it("lists the dates of a stay, across a month end", () => {
    expect(datesBetween("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(datesBetween("2026-11-02", "2026-11-01")).toEqual([]);
  });
});
