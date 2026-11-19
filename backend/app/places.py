"""Distance helpers for "near me" searches. Pure Python, tested on its own."""

import math

EARTH_RADIUS_M = 6_371_000


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line distance in metres between two points (haversine formula)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bounding_box(lat: float, lng: float, radius_m: float) -> tuple[float, float, float, float]:
    """(min_lat, max_lat, min_lng, max_lng) around a point. Used to let the database
    narrow the search quickly before exact distances are worked out."""
    d_lat = math.degrees(radius_m / EARTH_RADIUS_M)
    d_lng = math.degrees(radius_m / (EARTH_RADIUS_M * math.cos(math.radians(lat))))
    return lat - d_lat, lat + d_lat, lng - d_lng, lng + d_lng
