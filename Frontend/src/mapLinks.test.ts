import { describe, expect, it } from "vitest";
import { detectPlatform, hasCoords, navigationLink, placeLink, routeLink, searchLink, MODES, type Env, type Place } from "./mapLinks";

const ios: Env = { platform: "ios", appName: "accessitour.example" };
const android: Env = { ...ios, platform: "android" };
const desktop: Env = { ...ios, platform: "desktop" };
// Fictional test data: the names are real places, the coordinates are approximate.
const palace: Place = { name: "Gyeongbokgung Palace", lat: 37.5796, lng: 126.977 };
const bukchon: Place = { name: "Bukchon Hanok Village", lat: 37.5826, lng: 126.9836 };
const unplaced: Place = { name: "경복궁 & 광화문", lat: null, lng: null };

describe("coordinates", () => {
  it("accepts positions in Korea and rejects missing, swapped or impossible ones", () => {
    expect(hasCoords(palace)).toBe(true);
    expect(hasCoords(unplaced)).toBe(false);
    expect(hasCoords({ name: "x", lat: 126.977, lng: 37.5796 })).toBe(false); // latitude and longitude swapped
    expect(hasCoords({ name: "x", lat: NaN, lng: 127 })).toBe(false);
    expect(hasCoords({ name: "x", lat: 0, lng: 0 })).toBe(false);
  });
});

describe("Kakao Map", () => {
  it("shows a place as name,lat,lng", () => {
    expect(placeLink("kakao", palace, desktop)).toEqual({
      url: "https://map.kakao.com/link/map/Gyeongbokgung%20Palace,37.5796,126.977", kind: "place", needsApp: false });
  });
  it("keeps commas and slashes in a name from breaking the address", () => {
    const url = placeLink("kakao", { ...palace, name: "Cafe A/B, Jongno" }, desktop)!.url;
    expect(url).toBe("https://map.kakao.com/link/map/Cafe%20A%20B%20%20Jongno,37.5796,126.977");
  });
  it("opens directions without a mode when there is no start, so the person picks it in Kakao Map", () => {
    expect(routeLink("kakao", palace, "walk", ios)!.url).toBe("https://map.kakao.com/link/to/Gyeongbokgung%20Palace,37.5796,126.977");
  });
  it("uses the documented word for each travel mode between two stops", () => {
    const words = MODES.map((m) => routeLink("kakao", bukchon, m, desktop, palace)!.url.split("/")[5]);
    expect(words).toEqual(["traffic", "walk", "car", "bicycle"]);
    expect(routeLink("kakao", bukchon, "walk", desktop, palace)!.url).toBe(
      "https://map.kakao.com/link/by/walk/Gyeongbokgung%20Palace,37.5796,126.977/Bukchon%20Hanok%20Village,37.5826,126.9836");
  });
  it("searches by encoded name when the stop has no position", () => {
    expect(placeLink("kakao", unplaced, desktop, "Seoul")).toEqual({
      url: "https://map.kakao.com/link/search/" + encodeURIComponent("경복궁 & 광화문 Seoul"), kind: "search", needsApp: false });
  });
  it("has no turn-by-turn link", () => {
    expect(navigationLink("kakao", palace, ios)).toBeNull();
  });
});

describe("Naver Map", () => {
  it("shows a place in the app with lat, lng, name and appname", () => {
    expect(placeLink("naver", palace, ios)).toEqual({
      url: "nmap://place?lat=37.5796&lng=126.977&name=Gyeongbokgung%20Palace&appname=accessitour.example", kind: "place", needsApp: true });
  });
  it("uses the documented word for each travel mode and starts from the person's location by default", () => {
    const urls = MODES.map((m) => routeLink("naver", palace, m, ios)!.url);
    expect(urls.map((u) => u.split("?")[0])).toEqual(["nmap://route/public", "nmap://route/walk", "nmap://route/car", "nmap://route/bicycle"]);
    expect(urls[1]).toBe("nmap://route/walk?dlat=37.5796&dlng=126.977&dname=Gyeongbokgung%20Palace&appname=accessitour.example");
  });
  it("passes the previous stop as the start", () => {
    const url = routeLink("naver", bukchon, "walk", ios, palace)!.url;
    expect(url).toContain("slat=37.5796&slng=126.977&sname=Gyeongbokgung%20Palace&dlat=37.5826&dlng=126.9836");
  });
  it("ignores a start that has no position", () => {
    expect(routeLink("naver", palace, "walk", ios, unplaced)!.url).not.toContain("slat");
  });
  it("wraps the address in an intent on Android", () => {
    expect(routeLink("naver", palace, "car", android)!.url).toBe(
      "intent://route/car?dlat=37.5796&dlng=126.977&dname=Gyeongbokgung%20Palace&appname=accessitour.example"
      + "#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end");
  });
  it("offers turn-by-turn driving only in the phone app", () => {
    expect(navigationLink("naver", palace, ios)).toMatchObject({ kind: "navigation", url: expect.stringMatching(/^nmap:\/\/navigation\?dlat=37\.5796/) });
    expect(navigationLink("naver", palace, desktop)).toBeNull();
    expect(navigationLink("naver", unplaced, ios)).toBeNull();
  });
  it("searches by encoded name in the app when the stop has no position", () => {
    expect(placeLink("naver", unplaced, ios)!.url).toBe(
      "nmap://search?query=" + encodeURIComponent("경복궁 & 광화문") + "&appname=accessitour.example");
  });
  it("falls back to a website search on a computer, and has no route link there", () => {
    expect(placeLink("naver", palace, desktop, "Seoul")).toEqual({
      url: "https://map.naver.com/p/search/Gyeongbokgung%20Palace%20Seoul", kind: "search", needsApp: false });
    expect(routeLink("naver", palace, "walk", desktop)).toBeNull();
  });
});

describe("missing data", () => {
  it("gives no link for a stop with neither a position nor a name", () => {
    const nothing: Place = { name: "   ", lat: null, lng: null };
    for (const provider of ["naver", "kakao"] as const) {
      expect(placeLink(provider, nothing, ios)).toBeNull();
      expect(searchLink(provider, nothing, ios)).toBeNull();
      expect(routeLink(provider, nothing, "walk", ios)).toBeNull();
    }
  });
  it("gives no route to a stop without a position", () => {
    expect(routeLink("kakao", unplaced, "walk", desktop)).toBeNull();
  });
});

describe("platform", () => {
  it("tells phones from computers", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios"); // iPad
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("desktop");
  });
});
