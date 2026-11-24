"""Tests for "near me" distances and reading the restroom file (no database).

Run from the backend folder:  pytest -v
"""

from app.places import bounding_box, distance_m
from scripts.import_restrooms import parse_row

SEOUL_CITY_HALL = (37.5665, 126.9780)
GWANGHWAMUN = (37.5759, 126.9768)


def test_distance_between_two_seoul_landmarks():
    # City Hall to Gwanghwamun is about 1 km
    assert 1000 < distance_m(*SEOUL_CITY_HALL, *GWANGHWAMUN) < 1100


def test_distance_to_the_same_point_is_zero():
    assert distance_m(*SEOUL_CITY_HALL, *SEOUL_CITY_HALL) == 0


def test_bounding_box_contains_points_inside_the_radius():
    min_lat, max_lat, min_lng, max_lng = bounding_box(*SEOUL_CITY_HALL, 1500)
    lat, lng = GWANGHWAMUN
    assert min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


def row(**changes):
    values = {
        "ESNTL_ID": "KCKIFPO22N000000001", "FCLTY_NM": "응암역 화장실", "CTPRVN_NM": "서울특별시",
        "SIGNGU_NM": "은평구", "FCLTY_ROAD_NM_ADDR": "서울특별시 은평구 증산로 지하477",
        "ADDR_ENG_NM": "B477 Jeungsan-ro, Eunpyeong-gu, Seoul", "FCLTY_LA": "37.59874233",
        "FCLTY_LO": "126.9155128", "MALE_DSPSN_WTRCLS_CO": "1", "FEMALE_DSPSN_WTRCLS_CO": "1",
        "MALE_CHILD_WTRCLS_CO": "0", "MALE_CHILD_UIL_CO": "1", "FEMALE_CHILD_WTRCLS_CO": "",
        "USE_TIME_CN": "24시간", "NRSGRM_AT": "N", "UPDT_DT": "20230201",
    }
    values.update(changes)
    return values


def test_a_row_from_the_file_is_read():
    r = parse_row(row())
    assert r["name"] == "응암역 화장실" and r["address_en"].startswith("B477")
    assert r["accessible_toilets"] == 2 and r["child_toilets"] == 1
    assert r["opening_hours"] == "24시간" and r["has_nursing_room"] is False


def test_rows_without_a_location_in_korea_are_skipped():
    assert parse_row(row(FCLTY_LA="")) is None
    assert parse_row(row(FCLTY_LA="0", FCLTY_LO="0")) is None
    assert parse_row(row(FCLTY_NM="  ")) is None


def test_blank_counts_are_zero():
    assert parse_row(row(MALE_DSPSN_WTRCLS_CO="", FEMALE_DSPSN_WTRCLS_CO=""))["accessible_toilets"] == 0
