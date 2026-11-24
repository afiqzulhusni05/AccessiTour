"""Tests for branch-name matching in kakao_place.py.

Kakao is replaced by fake results, so these tests:
- make no real API calls
- give the same result every time

Coordinates are approximate test values, not real Kakao data.

Run from the AccessiTour project root:
    python backend/experiments/test_kakao_branch_matching.py
"""

import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import kakao_place  # noqa: E402


def fake_place(place_id, name, address, lat, lng, code=""):
    return {
        "id": place_id,
        "place_name": name,
        "address_name": address,
        "road_address_name": "",
        "y": str(lat),
        "x": str(lng),
        "category_group_code": code,
        "place_url": "",
    }


MUSEUM = fake_place("1", "부산박물관", "부산 남구 대연동", 35.1296, 129.0929, "CT1")
F1963 = fake_place("2", "F1963", "부산 수영구 망미동", 35.1770, 129.1150, "CT1")
TERAROSA_SUYEONG = fake_place("3", "테라로사 수영점", "부산 수영구 망미동", 35.1769, 129.1149, "CE7")
TERAROSA_HAEUNDAE = fake_place("4", "테라로사 해운대점", "부산 해운대구 우동", 35.1630, 129.1600, "CE7")
STARBUCKS_NEARBY = fake_place("5", "스타벅스 수영점", "부산 수영구 망미동", 35.1772, 129.1152, "CE7")

# What Kakao really returned for "f1963" (coordinates approximate)
REAL_F1963_RESULTS = [
    F1963,
    fake_place("6", "F1963 석천홀", "부산 수영구 망미동 475-1", 35.1770, 129.1150, "CT1"),
    fake_place("7", "F1963도서관", "부산 수영구 망미동 475-1", 35.1770, 129.1150),
    fake_place("8", "F1963 제3주차장", "부산 수영구 망미동 494-1", 35.1775, 129.1160, "PK6"),
    fake_place("9", "F1963 제2주차장", "부산 수영구 망미동 193-1", 35.1760, 129.1140, "PK6"),
]


def run_with_fake_kakao(results_by_query, names, place_category=None):
    """Run find_verified_place, answering every Kakao search
    from results_by_query instead of the real API."""

    def fake_search(query, region, near=None, radius_m=300):
        # A search "near" a landmark is stored under "NEAR:<query>"
        key = f"NEAR:{query}" if near is not None else query
        return results_by_query.get(key, [])

    with mock.patch.object(kakao_place, "search_place_candidates", fake_search):
        return kakao_place.find_verified_place(
            names=names,
            region="BUSAN",
            place_category=place_category,
        )


def test_exact_name_match():
    place = run_with_fake_kakao(
        {"부산박물관": [MUSEUM]},
        ["부산박물관", "Busan Museum"],
    )
    assert place is not None
    assert place["kakao_place_name"] == "부산박물관"


def test_terarosa_f1963_matches_suyeong_branch():
    place = run_with_fake_kakao(
        {
            "테라로사 F1963": [TERAROSA_SUYEONG, TERAROSA_HAEUNDAE],
            "f1963": [F1963],  # landmark search
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is not None
    assert place["kakao_place_name"] == "테라로사 수영점"


def test_real_case_full_name_returns_nothing():
    # Real Kakao behaviour: "테라로사 F1963" and "Terarosa F1963"
    # return nothing. The matcher must find F1963, then search
    # "테라로사" around it.
    place = run_with_fake_kakao(
        {
            "f1963": REAL_F1963_RESULTS,
            "NEAR:테라로사": [TERAROSA_SUYEONG],
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is not None
    assert place["kakao_place_name"] == "테라로사 수영점"


def test_nearby_search_far_branch_still_rejected():
    # Even if the nearby search somehow returns a far branch,
    # the 300 m distance check must reject it.
    place = run_with_fake_kakao(
        {
            "f1963": REAL_F1963_RESULTS,
            "NEAR:테라로사": [TERAROSA_HAEUNDAE],
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is None


def test_nearby_search_other_brand_rejected():
    # Nearby search returns a different shop next to F1963.
    place = run_with_fake_kakao(
        {
            "f1963": REAL_F1963_RESULTS,
            "NEAR:테라로사": [STARBUCKS_NEARBY],
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is None


def test_shop_preferred_over_landmark_building():
    # Kakao also returns the F1963 building for the Korean query.
    # "F1963" is contained in "테라로사 F1963", so the old rule gives
    # it 0.85. The confirmed branch (0.9) must win.
    place = run_with_fake_kakao(
        {
            "테라로사 F1963": [F1963, TERAROSA_SUYEONG],
            "f1963": [F1963],
        },
        ["테라로사 F1963", "Terarosa F1963"],
    )
    assert place is not None
    assert place["kakao_place_name"] == "테라로사 수영점"


def test_other_branch_far_from_landmark_is_rejected():
    # Only the Haeundae branch is returned. It is several km from
    # F1963, so it must NOT be accepted.
    place = run_with_fake_kakao(
        {
            "테라로사 F1963": [TERAROSA_HAEUNDAE],
            "f1963": [F1963],
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is None


def test_two_branches_without_location_stays_ambiguous():
    # Gemini gives only the brand. Two branches far apart:
    # existing ambiguity detection must still return None.
    place = run_with_fake_kakao(
        {"테라로사": [TERAROSA_SUYEONG, TERAROSA_HAEUNDAE]},
        ["테라로사", "Terarosa"],
        place_category="FOOD",
    )
    assert place is None


def test_landmark_not_found_returns_none():
    # Kakao cannot find the landmark, so the branch cannot be confirmed.
    place = run_with_fake_kakao(
        {"테라로사 F1963": [TERAROSA_SUYEONG]},
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is None


def test_unrelated_place_next_to_landmark_is_rejected():
    # A different brand right next to F1963 must not match.
    place = run_with_fake_kakao(
        {
            "테라로사 F1963": [STARBUCKS_NEARBY],
            "f1963": [F1963],
        },
        ["테라로사 F1963", "Terarosa F1963"],
        place_category="FOOD",
    )
    assert place is None


# --------------------------------------------------
# Extra branch suffix: "카파도키아 부산대점" -> "카파도키아"
# --------------------------------------------------

CAPPADOCIA = fake_place("20", "카파도키아", "부산 금정구 남산동 30-1", 35.2601, 129.0922, "FD6")
CAPPADOCIA_OTHER = fake_place("21", "카파도키아", "부산 해운대구 우동", 35.1630, 129.1600, "FD6")
CAPPADOCIA_HAEUNDAE_BRANCH = fake_place("22", "카파도키아 해운대점", "부산 해운대구 우동", 35.1630, 129.1600, "FD6")
CAPPADOCIA_HOUSE = fake_place("23", "카파도키아하우스", "부산 금정구 장전동", 35.2310, 129.0850, "FD6")
OTHER_KEBAB = fake_place("24", "이스탄불 케밥", "부산 금정구 장전동", 35.2312, 129.0852, "FD6")

CAPPADOCIA_NAMES = [
    "카파도키아 부산대점",
    "Cappadocia Busan National University Branch",
]


def test_extra_branch_suffix_matches_brand():
    # Real Kakao behaviour: the full name returns nothing,
    # the brand alone returns the restaurant.
    place = run_with_fake_kakao(
        {"카파도키아": [CAPPADOCIA]},
        CAPPADOCIA_NAMES,
        place_category="FOOD",
    )
    assert place is not None
    assert place["kakao_place_name"] == "카파도키아"


def test_extra_branch_suffix_unrelated_restaurant_rejected():
    # Brand search returns only other restaurants:
    # a similar-looking name and a different kebab shop.
    place = run_with_fake_kakao(
        {"카파도키아": [CAPPADOCIA_HOUSE, OTHER_KEBAB]},
        CAPPADOCIA_NAMES,
        place_category="FOOD",
    )
    assert place is None


def test_extra_branch_suffix_multiple_same_brand_is_ambiguous():
    # Two "카파도키아" far apart: we cannot know which is 부산대점.
    place = run_with_fake_kakao(
        {"카파도키아": [CAPPADOCIA, CAPPADOCIA_OTHER]},
        CAPPADOCIA_NAMES,
        place_category="FOOD",
    )
    assert place is None


def test_extra_branch_suffix_different_named_branch_rejected():
    # Kakao only has another, explicitly named branch.
    place = run_with_fake_kakao(
        {"카파도키아": [CAPPADOCIA_HAEUNDAE_BRANCH]},
        CAPPADOCIA_NAMES,
        place_category="FOOD",
    )
    assert place is None


def test_extra_branch_suffix_wrong_category_rejected():
    # Same name, but Kakao lists it as something other than food.
    not_food = fake_place("25", "카파도키아", "부산 금정구 남산동", 35.2601, 129.0922, "AT4")
    place = run_with_fake_kakao(
        {"카파도키아": [not_food]},
        CAPPADOCIA_NAMES,
        place_category="FOOD",
    )
    assert place is None


# --------------------------------------------------
# Mosque alias: documents CURRENT behaviour (not fixed yet)
# --------------------------------------------------

def test_mosque_alias_is_not_matched_yet():
    # "부산이슬람성원" vs "한국이슬람교 부산성원" scores 0.59.
    # Returning None is the safe answer until an alias rule exists.
    results = [
        fake_place("30", "한국이슬람교 부산성원", "부산 금정구 남산동 30-1", 35.2600, 129.0923),
        fake_place("31", "마스지드히다야툴라 장림", "부산 사하구 장림동 328-16", 35.0800, 128.9600),
        fake_place("32", "Masjid Al-Aqsa", "부산 남구 대연동 62-16", 35.1350, 129.0950),
        fake_place("33", "MASJID BAHRUL HIDAYAH", "부산 중구 남포동5가 30-1", 35.0960, 129.0300),
        fake_place("34", "녹산이슬라믹센터", "부산 강서구 송정동 1118-2", 35.0900, 128.8500),
    ]
    place = run_with_fake_kakao(
        {"부산이슬람성원": results},
        ["부산이슬람성원", "Busan Islamic Center"],
        place_category="ATTRACTION",
    )
    assert place is None


if __name__ == "__main__":
    tests = [
        value for name, value in list(globals().items())
        if name.startswith("test_")
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except AssertionError:
            failed += 1
            print(f"FAIL  {test.__name__}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)