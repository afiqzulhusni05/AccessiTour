import logging
import math
import re
from difflib import SequenceMatcher
from typing import Optional

import requests

from app.config import settings


logger = logging.getLogger(__name__)


KAKAO_KEYWORD_SEARCH_URL = (
    "https://dapi.kakao.com/v2/local/search/keyword.json"
)

# Number of Kakao results to compare.
CANDIDATE_COUNT = 5

# Rough geographical boundaries for each supported region.
# Format: min_longitude,min_latitude,max_longitude,max_latitude
REGION_RECTS = {
    "SEOUL": "126.76,37.41,127.19,37.72",
    "BUSAN": "128.75,34.88,129.35,35.40",
    "JEJU": "126.08,33.10,126.98,33.58",
}

# Kakao addresses should begin with one of these values.
REGION_ADDRESS_PREFIXES = {
    "SEOUL": ("서울",),
    "BUSAN": ("부산",),
    "JEJU": ("제주",),
}

# Kakao category group codes.
FOOD_CATEGORY_CODES = {
    "FD6",  # Restaurant
    "CE7",  # Cafe
}

PARKING_CATEGORY_CODE = "PK6"

# These are often facilities belonging to the actual attraction,
# rather than the attraction itself.
FACILITY_WORDS = (
    "주차장",
    "화장실",
    "매표소",
    "정문",
    "후문",
    "입구",
    "출구",
    "정류장",
)

# Minimum similarity required between the searched name
# and the Kakao result.
MIN_NAME_SCORE = 0.8

# If two candidates have almost the same score but are
# geographically far apart, do not guess which one is correct.
AMBIGUOUS_SCORE_GAP = 0.05
AMBIGUOUS_DISTANCE_KM = 1.0


def search_place_candidates(
    query: str,
    region: str,
) -> list[dict]:
    """
    Search Kakao for several possible places.

    Returns raw Kakao results.
    Raises RuntimeError only if the Kakao request itself fails.
    """

    region = region.upper()

    headers = {
        "Authorization": (
            f"KakaoAK {settings.kakao_rest_api_key}"
        )
    }

    params = {
        "query": query,
        "size": CANDIDATE_COUNT,
        "sort": "accuracy",
    }

    rect = REGION_RECTS.get(region)

    if rect:
        params["rect"] = rect

    try:
        response = requests.get(
            KAKAO_KEYWORD_SEARCH_URL,
            headers=headers,
            params=params,
            timeout=10,
        )

        response.raise_for_status()

    except requests.RequestException as error:
        raise RuntimeError(
            f"Kakao place search failed: {error}"
        ) from error

    data = response.json()

    return data.get("documents", [])


def normalize_name(name: str) -> str:
    """
    Normalize a place name so two names are easier to compare.

    Example:
    "누리마루 APEC하우스"
    becomes
    "누리마루apec하우스"
    """

    name = name.lower()

    # Remove text inside parentheses.
    name = re.sub(
        r"\(.*?\)",
        "",
        name,
    )

    # Remove spaces and punctuation.
    name = re.sub(
        r"[^0-9a-z가-힣]",
        "",
        name,
    )

    return name


def name_score(
    query: str,
    candidate_name: str,
) -> float:
    """
    Return a similarity score from 0.0 to 1.0.
    """

    query_normalized = normalize_name(query)
    candidate_normalized = normalize_name(candidate_name)

    if not query_normalized or not candidate_normalized:
        return 0.0

    if query_normalized == candidate_normalized:
        return 1.0

    score = SequenceMatcher(
        None,
        query_normalized,
        candidate_normalized,
    ).ratio()

    # Example:
    # 카파도키아
    # 카파도키아 부산대점
    #
    # One name is clearly contained in the other.
    shorter_length = min(
        len(query_normalized),
        len(candidate_normalized),
    )

    if (
        shorter_length >= 3
        and (
            query_normalized in candidate_normalized
            or candidate_normalized in query_normalized
        )
    ):
        score = max(
            score,
            0.85,
        )

    return score


def is_in_region(
    candidate: dict,
    region: str,
) -> bool:
    """
    Check that Kakao's returned address is actually
    inside the requested region.
    """

    region = region.upper()

    prefixes = REGION_ADDRESS_PREFIXES.get(region)

    if not prefixes:
        return False

    address = (
        candidate.get("road_address_name")
        or candidate.get("address_name")
        or ""
    )

    return address.startswith(prefixes)


def is_facility_of_place(
    query: str,
    candidate_name: str,
) -> bool:
    """
    Reject facilities such as parking lots or entrances
    when the user actually searched for the main place.
    """

    for word in FACILITY_WORDS:
        if (
            word in candidate_name
            and word not in query
        ):
            return True

    return False


def category_is_ok(
    candidate: dict,
    place_category: Optional[str],
) -> bool:
    """
    Check whether Kakao's category makes sense
    for the itinerary stop.
    """

    code = candidate.get(
        "category_group_code",
        "",
    )

    # Never accept a parking lot as the main place.
    if code == PARKING_CATEGORY_CODE:
        return False

    # Food stops should be restaurants or cafes.
    if place_category == "FOOD":
        return code in FOOD_CATEGORY_CODES

    # Attractions are kept flexible because many attractions
    # do not have a useful Kakao category group code.
    return True


def distance_km(
    first: dict,
    second: dict,
) -> float:
    """
    Calculate straight-line distance between two Kakao
    search results using their coordinates.
    """

    lat1 = math.radians(
        float(first["y"])
    )

    lon1 = math.radians(
        float(first["x"])
    )

    lat2 = math.radians(
        float(second["y"])
    )

    lon2 = math.radians(
        float(second["x"])
    )

    haversine = (
        math.sin(
            (lat2 - lat1) / 2
        ) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(
            (lon2 - lon1) / 2
        ) ** 2
    )

    return (
        2
        * 6371
        * math.asin(
            math.sqrt(haversine)
        )
    )


def verify_place_candidate(
    query: str,
    candidate: dict,
    region: str,
    place_category: Optional[str] = None,
) -> Optional[float]:
    """
    Check whether one Kakao result is safe to accept.

    Returns its name similarity score if accepted.
    Returns None if rejected.
    """

    candidate_name = candidate.get(
        "place_name",
        "",
    )

    if not is_in_region(
        candidate,
        region,
    ):
        return None

    if is_facility_of_place(
        query,
        candidate_name,
    ):
        return None

    if not category_is_ok(
        candidate,
        place_category,
    ):
        return None

    score = name_score(
        query,
        candidate_name,
    )

    if score < MIN_NAME_SCORE:
        return None

    return score


def find_verified_place(
    names: list[Optional[str]],
    region: str,
    place_category: Optional[str] = None,
) -> Optional[dict]:
    """
    Try to find one confidently verified Kakao place.

    Korean name should normally be provided first,
    followed by the display/English name.

    Returns None when no confident match exists.

    Kakao failure for one stop will not break
    the whole itinerary.
    """

    region = region.upper()

    # Remove empty names and duplicates
    # while keeping the original order.
    queries = []

    for name in names:
        if not name:
            continue

        cleaned_name = name.strip()

        if (
            cleaned_name
            and cleaned_name not in queries
        ):
            queries.append(cleaned_name)

    for query in queries:
        try:
            candidates = search_place_candidates(
                query,
                region,
            )

        except RuntimeError as error:
            logger.warning(
                "Kakao search failed for %r: %s",
                query,
                error,
            )
            continue

        scored_candidates = []

        for candidate in candidates:
            score = verify_place_candidate(
                query=query,
                candidate=candidate,
                region=region,
                place_category=place_category,
            )

            if score is not None:
                scored_candidates.append(
                    (
                        score,
                        candidate,
                    )
                )

        if not scored_candidates:
            logger.info(
                "No verified Kakao match for %r",
                query,
            )
            continue

        # Highest similarity first.
        scored_candidates.sort(
            key=lambda item: item[0],
            reverse=True,
        )

        best_score, best_candidate = (
            scored_candidates[0]
        )

        # If two different places are almost equally likely
        # but far apart, do not guess.
        if len(scored_candidates) > 1:
            (
                second_score,
                second_candidate,
            ) = scored_candidates[1]

            if (
                best_score - second_score
                <= AMBIGUOUS_SCORE_GAP
                and distance_km(
                    best_candidate,
                    second_candidate,
                )
                > AMBIGUOUS_DISTANCE_KM
            ):
                logger.info(
                    (
                        "Ambiguous Kakao match for %r: "
                        "%r vs %r"
                    ),
                    query,
                    best_candidate["place_name"],
                    second_candidate["place_name"],
                )

                return None

        logger.info(
            "Verified %r -> %r (score %.2f)",
            query,
            best_candidate["place_name"],
            best_score,
        )

        return {
            "kakao_place_id": best_candidate["id"],
            "kakao_place_name": (
                best_candidate["place_name"]
            ),
            "address": (
                best_candidate.get(
                    "road_address_name"
                )
                or best_candidate.get(
                    "address_name"
                )
            ),
            "latitude": float(
                best_candidate["y"]
            ),
            "longitude": float(
                best_candidate["x"]
            ),
            "place_url": best_candidate.get(
                "place_url"
            ),
            "match_score": round(
                best_score,
                2,
            ),
        }

    return None