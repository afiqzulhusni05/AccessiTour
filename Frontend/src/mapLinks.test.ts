import { describe, expect, it } from "vitest";
import { directionsLink, hasCoords, MODES, searchLink, showLink, type Place } from "./mapLinks";

// Fictional test data: the names are real places, the coordinates are approximate.
const palace: Place = { name: "Gyeongbokgung Palace", lat: 37.5796, lng: 126.977 };
const bukchon: Place = { name: "Bukchon Hanok Village", lat: 37.5826, lng: 126.9836 };
const unplaced: Place = { name: "경복궁 & 광화문", lat: null, lng: null };
const K = "https://map.kakao.com/link";

describe("coordinates", () => {
  it("accepts positions in Korea and rejects missing, swapped or impossible ones", () => {
    expect(hasCoords(palace)).toBe(true);
    expect(hasCoords(unplaced)).toBe(false);
    expect(hasCoords({ name: "x", lat: 126.977, lng: 37.5796 })).toBe(false); // swapped
    expect(hasCoords({ name: "x", lat: NaN, lng: 127 })).toBe(false);
  });
});

describe("Kakao Map links", () => {
  it("shows a place as name,lat,lng", () => {
    expect(showLink(palace)).toBe(`${K}/map/Gyeongbokgung%20Palace,37.5796,126.977`);
  });
  it("searches by encoded name when the place has no position", () => {
    expect(showLink(unplaced, "Seoul")).toBe(`${K}/search/` + encodeURIComponent("경복궁 & 광화문 Seoul"));
  });
  it("keeps commas and slashes in a name from breaking the address", () => {
    expect(showLink({ ...palace, name: "Cafe A/B, Jongno" })).toBe(`${K}/map/Cafe%20A%20B%20%20Jongno,37.5796,126.977`);
  });
  it("fills in the previous stop as the start and this stop as the destination", () => {
    expect(directionsLink(bukchon, palace)).toBe(
      `${K}/from/Gyeongbokgung%20Palace,37.5796,126.977/to/Bukchon%20Hanok%20Village,37.5826,126.9836`);
  });
  it("preselects the way of travelling when the stop has one", () => {
    expect(MODES.map((m) => directionsLink(bukchon, palace, m)!.split("/")[5])).toEqual(["traffic", "walk", "car", "bicycle"]);
  });
  it("starts from the person's own location without a previous stop (or one with no position)", () => {
    expect(directionsLink(palace)).toBe(`${K}/to/Gyeongbokgung%20Palace,37.5796,126.977`);
    expect(directionsLink(palace, unplaced)).toBe(`${K}/to/Gyeongbokgung%20Palace,37.5796,126.977`);
  });
  it("gives nothing for a destination without a position, or a place without a name", () => {
    expect(directionsLink(unplaced, palace)).toBeNull();
    expect(searchLink({ name: "  ", lat: null, lng: null })).toBeNull();
  });
});
