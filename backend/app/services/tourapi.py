"""Restaurants and sights near a point, from the Korea Tourism Organization's English
tourist information service (TourAPI, 한국관광공사 영문 관광정보서비스, via data.go.kr).

Kept free of FastAPI and settings so it can be tested on its own:
the router passes in the key.
"""

import json
import xml.etree.ElementTree as ET

import requests

LOCATION_LIST_URL = "https://apis.data.go.kr/B551011/EngService2/locationBasedList2"
RESTAURANT_TYPE = "82"  # contentTypeId for "Food" in the English service
TIMEOUT_SECONDS = 8

# cat3 codes -> a short English label
CUISINES = {
    "A05020100": "Korean",
    "A05020200": "Western",
    "A05020300": "Japanese",
    "A05020400": "Chinese",
    "A05020700": "International",
    "A05020900": "Cafe",
    "A05021000": "Bar",
}


class TourApiError(Exception):
    """TourAPI could not be reached or answered with an error."""


def _clean(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _https(url: str | None) -> str | None:
    # The site is served over https, so http images would be blocked by browsers.
    if url and url.startswith("http://"):
        return "https://" + url[len("http://"):]
    return url


def parse_restaurants(answer_text: str) -> list[dict]:
    """Turn TourAPI's JSON answer into a list of plain dicts, closest first."""
    text = answer_text.strip()

    # Key problems come back as XML even when JSON was asked for.
    if text.startswith("<"):
        try:
            root = ET.fromstring(text)
        except ET.ParseError as exc:
            raise TourApiError("TourAPI sent an unreadable answer") from exc
        error = root.findtext(".//errMsg") or root.findtext(".//returnAuthMsg") or "unknown"
        raise TourApiError(f"TourAPI error: {error.strip()}")

    try:
        data = json.loads(text)
        header = data["response"]["header"]
        body = data["response"].get("body") or {}
    except (ValueError, KeyError, TypeError) as exc:
        raise TourApiError("TourAPI sent an unreadable answer") from exc

    code = str(header.get("resultCode", "")).strip()
    if code not in ("0000", "00"):
        raise TourApiError(f"TourAPI error {code}: {header.get('resultMsg', '')}")

    # No results: "items" is an empty string. One result: "item" may be a dict.
    items = body.get("items") or {}
    raw = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(raw, dict):
        raw = [raw]

    restaurants = []
    for item in raw:
        name = _clean(item.get("title"))
        lat = _float(item.get("mapy"))
        lng = _float(item.get("mapx"))
        if not name or lat is None or lng is None:
            continue
        dist = _float(item.get("dist"))
        restaurants.append({
            "content_id": _clean(item.get("contentid")),
            "name": name,
            "cuisine": CUISINES.get(_clean(item.get("cat3")) or "", "Restaurant"),
            "address": _clean(item.get("addr1")),
            "phone": _clean(item.get("tel")),
            "latitude": lat,
            "longitude": lng,
            "distance_m": round(dist) if dist is not None else None,
            "image_url": _https(_clean(item.get("firstimage"))),
            "thumbnail_url": _https(_clean(item.get("firstimage2"))),
        })
    restaurants.sort(key=lambda r: r["distance_m"] if r["distance_m"] is not None else 10**9)
    return restaurants


def fetch_nearby_restaurants(
    api_key: str, lat: float, lng: float, radius_m: int, limit: int
) -> list[dict]:
    """Ask TourAPI for the restaurants closest to (lat, lng)."""
    params = {
        "serviceKey": api_key,
        "MobileOS": "ETC",
        "MobileApp": "AccessiTour",
        "_type": "json",
        "mapX": lng,
        "mapY": lat,
        "radius": radius_m,
        "contentTypeId": RESTAURANT_TYPE,
        "arrange": "E",  # by distance
        "numOfRows": limit,
        "pageNo": 1,
    }
    try:
        response = requests.get(LOCATION_LIST_URL, params=params, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise TourApiError("Could not reach TourAPI") from exc
    return parse_restaurants(response.text)[:limit]


# contentTypeId in the English service -> how to describe a place of that type
SIGHT_TYPES = {"76": "Tourist attraction", "78": "Cultural site"}


def fetch_nearby_sights(api_key: str, lat: float, lng: float, radius_m: int, limit: int) -> list[dict]:
    """Tourist attractions and cultural sites (museums, palaces, galleries) closest to (lat, lng)."""
    found: list[dict] = []
    for content_type, kind in SIGHT_TYPES.items():
        params = {
            "serviceKey": api_key, "MobileOS": "ETC", "MobileApp": "AccessiTour", "_type": "json",
            "mapX": lng, "mapY": lat, "radius": radius_m, "contentTypeId": content_type,
            "arrange": "E", "numOfRows": limit, "pageNo": 1,
        }
        try:
            response = requests.get(LOCATION_LIST_URL, params=params, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise TourApiError("Could not reach TourAPI") from exc
        for place in parse_restaurants(response.text):  # same answer format as for restaurants
            place.pop("cuisine")
            place["kind"] = kind
            found.append(place)
    found.sort(key=lambda p: p["distance_m"] if p["distance_m"] is not None else 10**9)
    return found[:limit]
