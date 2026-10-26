import { describe, expect, it } from "vitest";
import { checkLegs, moveLeg, stayDays, transferModes } from "./multiCity";

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
