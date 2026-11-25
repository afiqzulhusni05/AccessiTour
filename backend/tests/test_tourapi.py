"""Tests for reading TourAPI's restaurant answer (no network).

Run from the backend folder:  pytest -v
"""

import json

import pytest

from app.services.tourapi import TourApiError, parse_restaurants


def answer(items, code="0000"):
    return json.dumps({"response": {
        "header": {"resultCode": code, "resultMsg": "OK"},
        "body": {"items": items, "numOfRows": 10, "pageNo": 1, "totalCount": 2},
    }})


# Shortened copies of real items near Seoul City Hall
SHABU = {
    "addr1": "17 Jong-ro 3-gil, Jongno-gu, Seoul", "cat3": "A05020100", "contentid": "3574482",
    "dist": "511.56072212263024", "firstimage": "http://tong.visitkorea.or.kr/cms/resource/15/3570215_image2_1.jpg",
    "firstimage2": "", "mapx": "126.9789291877", "mapy": "37.5710481741", "tel": "",
    "title": "Modern Shabu House Gwanghwamun D Tower Branch (모던샤브하우스 광화문D타워점)",
}
STARBUCKS = {
    "addr1": "100 Toegye-ro, Jung-gu, Seoul", "cat3": "A05020900", "contentid": "3046513",
    "dist": "822.1703454109", "firstimage": "", "mapx": "126.9829402392", "mapy": "37.5602383912",
    "tel": "02-000-0000", "title": "Starbucks Byuldabang (스타벅스 별다방)",
}


def test_restaurants_are_read_and_sorted_closest_first():
    found = parse_restaurants(answer({"item": [STARBUCKS, SHABU]}))
    assert [r["content_id"] for r in found] == ["3574482", "3046513"]
    shabu = found[0]
    assert shabu["name"].startswith("Modern Shabu House")
    assert shabu["cuisine"] == "Korean" and shabu["distance_m"] == 512
    assert shabu["phone"] is None and shabu["thumbnail_url"] is None
    assert shabu["image_url"].startswith("https://tong.visitkorea.or.kr/")
    assert found[1]["cuisine"] == "Cafe" and found[1]["phone"] == "02-000-0000"


def test_a_single_result_is_read():
    found = parse_restaurants(answer({"item": SHABU}))
    assert len(found) == 1


def test_no_results_is_an_empty_list():
    assert parse_restaurants(answer("")) == []


def test_items_without_a_location_are_skipped():
    assert parse_restaurants(answer({"item": [dict(SHABU, mapx="")]})) == []


def test_a_key_problem_is_reported():
    xml = ("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
           "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
           "</cmmMsgHeader></OpenAPI_ServiceResponse>")
    with pytest.raises(TourApiError):
        parse_restaurants(xml)


def test_an_error_result_code_is_reported():
    with pytest.raises(TourApiError, match="0022"):
        parse_restaurants(answer("", code="0022"))


def test_sights_merge_attractions_and_cultural_sites_closest_first(monkeypatch):
    from app.services import tourapi

    palace = {"addr1": "161 Sajik-ro, Jongno-gu, Seoul", "contentid": "264337", "dist": "900.5",
              "firstimage": "", "firstimage2": "", "mapx": "126.9769", "mapy": "37.5796", "tel": "",
              "title": "Gyeongbokgung Palace (경복궁)"}
    museum = {"addr1": "37 Samcheong-ro, Jongno-gu, Seoul", "contentid": "129703", "dist": "300.0",
              "firstimage": "http://example.test/m.jpg", "firstimage2": "", "mapx": "126.9790", "mapy": "37.5770",
              "tel": "", "title": "National Folk Museum of Korea (국립민속박물관)"}
    asked = []

    class Reply:
        def __init__(self, text):
            self.text = text

        def raise_for_status(self):
            pass

    def fake_get(url, params, timeout):
        asked.append(params["contentTypeId"])
        return Reply(answer({"item": [palace] if params["contentTypeId"] == "76" else [museum]}))

    monkeypatch.setattr(tourapi.requests, "get", fake_get)
    found = tourapi.fetch_nearby_sights("key", 37.57, 126.98, 1500, 10)
    assert asked == ["76", "78"]
    assert [(s["name"], s["kind"]) for s in found] == [
        ("National Folk Museum of Korea (국립민속박물관)", "Cultural site"),
        ("Gyeongbokgung Palace (경복궁)", "Tourist attraction"),
    ]
    assert "cuisine" not in found[0] and found[0]["image_url"] == "https://example.test/m.jpg"
