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

# Branch-name matching (e.g. "테라로사 F1963" -> "테라로사 수영점").
# The branch is accepted only if it is this close to the landmark
# named in Gemini's name (F1963).
BRANCH_LANDMARK_MAX_KM = 0.3

# Score given when brand AND location are both confirmed.
# Slightly above the 0.85 "contained name" score, so the shop is
# preferred over the landmark building itself when both pass.
BRANCH_MATCH_SCORE = 0.9

# The brand part must be at least this long, so very short brand
# names cannot match by accident.
MIN_BRAND_LENGTH = 3


def search_place_candidates(
    query: str,
    region: str,
    near: Optional[dict] = None,
    radius_m: int = 300,
) -> list[dict]:
    """
    Search Kakao for several possible places.

    Normally searches the whole region.
    If `near` (a Kakao place) is given, searches only within
    radius_m metres of that place instead.

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

    if near is not None:
        # x = longitude, y = latitude, radius in metres
        params["x"] = near["x"]
        params["y"] = near["y"]
        params["radius"] = radius_m
    else:
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


def split_branch(name: str) -> tuple[str, str]:
    """
    Split a Kakao chain name into brand and branch.

    "테라로사 수영점" -> ("테라로사", "수영")
    "부산박물관"      -> ("부산박물관", "")

    Only the LAST word, separated by a space and ending in 점,
    counts as a branch. That is how Kakao writes chain branches.
    """

    words = name.strip().split()

    if (
        len(words) >= 2
        and words[-1].endswith("점")
        and len(words[-1]) >= 2
    ):
        brand = normalize_name(" ".join(words[:-1]))
        branch = normalize_name(words[-1][:-1])
        return brand, branch

    return normalize_name(name), ""


def find_landmark(
    landmark_name: str,
    region: str,
) -> Optional[dict]:
    """
    Find the landmark itself on Kakao, e.g. "f1963".

    Only an EXACT name match inside the region counts.
    If several exact matches are far apart, we cannot tell
    which one is meant, so return None.
    """

    try:
        candidates = search_place_candidates(
            landmark_name,
            region,
        )

    except RuntimeError as error:
        logger.warning(
            "Kakao landmark search failed for %r: %s",
            landmark_name,
            error,
        )
        return None

    exact = [
        candidate
        for candidate in candidates
        if normalize_name(candidate.get("place_name", "")) == landmark_name
        and is_in_region(candidate, region)
    ]

    if not exact:
        return None

    for other in exact[1:]:
        if distance_km(exact[0], other) > AMBIGUOUS_DISTANCE_KM:
            return None

    return exact[0]


def search_near_landmark(
    query: str,
    region: str,
    landmark_cache: dict,
) -> list[dict]:
    """
    Used when Kakao finds nothing for the full name, e.g.
    "테라로사 F1963" returns no results.

    Tries each word as a landmark ("F1963"). If one is found
    on Kakao, searches the other words ("테라로사") only around it.

    Returns the nearby Kakao results (may be empty).
    """

    words = query.split()

    # Only short multi-word names like "brand + landmark".
    if not 2 <= len(words) <= 4:
        return []

    for index, word in enumerate(words):
        location = normalize_name(word)

        if len(location) < 2:
            continue

        if location not in landmark_cache:
            landmark_cache[location] = find_landmark(location, region)

        landmark = landmark_cache[location]

        if landmark is None:
            continue

        rest = " ".join(words[:index] + words[index + 1:])

        try:
            return search_place_candidates(
                rest,
                region,
                near=landmark,
                radius_m=int(BRANCH_LANDMARK_MAX_KM * 1000),
            )

        except RuntimeError as error:
            logger.warning(
                "Kakao nearby search failed for %r: %s",
                rest,
                error,
            )
            return []

    return []


def search_brand_without_branch(
    query: str,
    region: str,
) -> list[dict]:
    """
    Used when Kakao finds nothing for a name with a branch suffix
    that Kakao does not use, e.g. "카파도키아 부산대점".

    Searches only the brand ("카파도키아") and keeps ONLY results
    whose own brand is exactly the same. Different shops are dropped.

    If Kakao has more than one same-brand place far apart, we cannot
    tell which branch was meant, so nothing is returned.
    """

    brand, branch = split_branch(query)

    # Only names like "brand + something점".
    if not branch or len(brand) < MIN_BRAND_LENGTH:
        return []

    brand_text = " ".join(query.split()[:-1])

    try:
        results = search_place_candidates(brand_text, region)

    except RuntimeError as error:
        logger.warning(
            "Kakao brand search failed for %r: %s",
            brand_text,
            error,
        )
        return []

    same_brand = [
        candidate
        for candidate in results
        if split_branch(candidate.get("place_name", ""))[0] == brand
    ]

    for other in same_brand[1:]:
        if distance_km(same_brand[0], other) > AMBIGUOUS_DISTANCE_KM:
            logger.info(
                "Several %r places found, branch unclear for %r",
                brand_text,
                query,
            )
            return []

    return same_brand


def verify_branch_candidate(
    query: str,
    candidate: dict,
    region: str,
    place_category: Optional[str],
    landmark_cache: dict,
) -> Optional[float]:
    """
    Second chance for a candidate that failed the normal name check
    only because the branch is written differently.

    Accepts "테라로사 수영점" for the query "테라로사 F1963" only when:
      1. the brand matches exactly ("테라로사" == "테라로사"),
      2. the query has an extra location word ("f1963"),
      3. that location exists on Kakao as a landmark, and
      4. this branch is within BRANCH_LANDMARK_MAX_KM of it.

    Returns BRANCH_MATCH_SCORE if accepted, otherwise None.
    """

    candidate_name = candidate.get("place_name", "")

    # Same safety checks as the normal path.
    if not is_in_region(candidate, region):
        return None

    if is_facility_of_place(query, candidate_name):
        return None

    if not category_is_ok(candidate, place_category):
        return None

    brand, branch = split_branch(candidate_name)

    # Only chain branches ("brand + branch점") use this path.
    if not branch or len(brand) < MIN_BRAND_LENGTH:
        return None

    query_normalized = normalize_name(query)

    # The query must START with the exact brand.
    if not query_normalized.startswith(brand):
        return None

    # What is left is the location word, e.g. "f1963".
    location = query_normalized[len(brand):]

    if len(location) < 2:
        return None

    # Search each landmark only once per stop.
    if location not in landmark_cache:
        landmark_cache[location] = find_landmark(location, region)

    landmark = landmark_cache[location]

    if landmark is None:
        return None

    if distance_km(candidate, landmark) > BRANCH_LANDMARK_MAX_KM:
        return None

    logger.info(
        "Branch match: %r -> %r (near landmark %r)",
        query,
        candidate_name,
        landmark.get("place_name"),
    )

    return BRANCH_MATCH_SCORE


def find_verified_place(
    names: list[Optional[str]],
    region: str,
    place_category: Optional[str] = None,
) -> Optional[dict]:
    """
    Try to find one confidently verified Kakao place.

    Korean name should normally be provided first,
    followed by the display/English name.

    Search all provided names first, then compare all
    verified candidates together.

    Returns None when no confident match exists.
    """

    region = region.upper()

    # Without a Kakao key, skip verification: the stop is kept, just without a map position.
    if not settings.kakao_rest_api_key:
        return None

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

    # Store all verified candidates from ALL queries.
    # Kakao place ID is used to avoid duplicates.
    scored_by_id = {}

    # Landmark searches done for branch matching, reused per stop.
    landmark_cache = {}

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

        # Kakao found nothing for the full name (e.g. "테라로사 F1963"):
        # look for the rest of the name around a landmark in it.
        if not candidates:
            candidates = search_near_landmark(
                query,
                region,
                landmark_cache,
            )

            # Also try the brand alone when the name ends in a branch
            # Kakao does not use (e.g. "카파도키아 부산대점").
            candidates = candidates + search_brand_without_branch(
                query,
                region,
            )

        found_for_query = False

        for candidate in candidates:
            score = verify_place_candidate(
                query=query,
                candidate=candidate,
                region=region,
                place_category=place_category,
            )

            # Normal check failed: try the branch-name check.
            if score is None:
                score = verify_branch_candidate(
                    query=query,
                    candidate=candidate,
                    region=region,
                    place_category=place_category,
                    landmark_cache=landmark_cache,
                )

            if score is None:
                continue

            found_for_query = True

            candidate_id = candidate.get("id")

            if not candidate_id:
                continue

            previous = scored_by_id.get(candidate_id)

            # If the same Kakao place appears in both searches,
            # keep its best score.
            if previous is None or score > previous[0]:
                scored_by_id[candidate_id] = (
                    score,
                    candidate,
                    query,
                )

        if not found_for_query:
            logger.info(
                "No verified Kakao match for %r",
                query,
            )

    # Nothing from either Korean or English search passed.
    if not scored_by_id:
        return None

    # Compare every candidate from both searches together.
    scored_candidates = list(scored_by_id.values())

    scored_candidates.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    best_score, best_candidate, best_query = (
        scored_candidates[0]
    )

    # If two different places are almost equally likely
    # but far apart, do not guess.
    if len(scored_candidates) > 1:
        (
            second_score,
            second_candidate,
            _,
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
                    "Ambiguous Kakao match: "
                    "%r vs %r"
                ),
                best_candidate["place_name"],
                second_candidate["place_name"],
            )

            return None

    logger.info(
        "Verified %r -> %r (score %.2f)",
        best_query,
        best_candidate["place_name"],
        best_score,
    )

    return {
        "kakao_place_id": best_candidate["id"],
        "kakao_place_name": best_candidate["place_name"],
        "address": (
            best_candidate.get("road_address_name")
            or best_candidate.get("address_name")
        ),
        "latitude": float(best_candidate["y"]),
        "longitude": float(best_candidate["x"]),
        "place_url": best_candidate.get("place_url"),
        "match_score": round(best_score, 2),
    }