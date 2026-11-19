"""Nearby emergency hospitals from the National Emergency Medical Center
(국립중앙의료원 전국 응급의료기관 정보 조회 서비스, via data.go.kr).

Kept free of FastAPI and settings so it can be tested on its own:
the router passes in the key.
"""

import xml.etree.ElementTree as ET

import requests

HOSPITALS_URL = (
    "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytLcinfoInqire"
)
TIMEOUT_SECONDS = 8


class EmergencyServiceError(Exception):
    """The hospital service could not be reached or answered with an error."""


def _text(item: ET.Element, tag: str) -> str | None:
    value = item.findtext(tag)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _float(item: ET.Element, tag: str) -> float | None:
    try:
        return float(_text(item, tag))
    except (TypeError, ValueError):
        return None


def parse_hospitals(xml_text: str) -> list[dict]:
    """Turn the service's XML answer into a list of plain dicts, closest first."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise EmergencyServiceError("The hospital service sent an unreadable answer") from exc

    # Key problems come back in a different shape: <OpenAPI_ServiceResponse>
    error = root.findtext(".//errMsg") or root.findtext(".//returnAuthMsg")
    if error:
        raise EmergencyServiceError(f"Hospital service error: {error.strip()}")

    code = (root.findtext("./header/resultCode") or "").strip()
    if code and code != "00":
        message = (root.findtext("./header/resultMsg") or "").strip()
        raise EmergencyServiceError(f"Hospital service error {code}: {message}")

    hospitals = []
    for item in root.iter("item"):
        name = _text(item, "dutyName")
        lat = _float(item, "latitude")
        lng = _float(item, "longitude")
        if not name or lat is None or lng is None:
            continue
        distance_km = _float(item, "distance")
        hospitals.append({
            "hpid": _text(item, "hpid"),
            "name": name,
            "kind": _text(item, "dutyDivName"),
            "address": _text(item, "dutyAddr"),
            "phone": _text(item, "dutyTel1"),
            "latitude": lat,
            "longitude": lng,
            "distance_m": round(distance_km * 1000) if distance_km is not None else None,
        })
    hospitals.sort(key=lambda h: h["distance_m"] if h["distance_m"] is not None else 10**9)
    return hospitals


def fetch_nearby_hospitals(api_key: str, lat: float, lng: float, limit: int) -> list[dict]:
    """Ask the service for the emergency hospitals nearest to (lat, lng)."""
    params = {
        "serviceKey": api_key,
        "WGS84_LON": lng,
        "WGS84_LAT": lat,
        "pageNo": 1,
        "numOfRows": limit,
    }
    try:
        response = requests.get(HOSPITALS_URL, params=params, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise EmergencyServiceError("Could not reach the hospital service") from exc
    return parse_hospitals(response.text)[:limit]
