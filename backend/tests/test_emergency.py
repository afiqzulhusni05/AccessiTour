"""Tests for reading the emergency hospital service's answer (no network).

Run from the backend folder:  pytest -v
"""

import pytest

from app.services.emergency import EmergencyServiceError, parse_hospitals

# Shortened copy of a real answer for Seoul City Hall
OK_ANSWER = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>
<item><cnt>106</cnt><distance>0.97</distance><dutyAddr>서울특별시 종로구 새문안로 9, 적십자병원 (평동)</dutyAddr><dutyDivName>종합병원</dutyDivName><dutyName>서울적십자병원</dutyName><dutyTel1>02-2002-8000</dutyTel1><hpid>A1100029</hpid><latitude>37.56715536263689</latitude><longitude>126.96699861289684</longitude></item>
<item><cnt>106</cnt><distance>0.91</distance><dutyAddr>서울특별시 종로구 새문안로 29 (평동)</dutyAddr><dutyDivName>종합병원</dutyDivName><dutyName>강북삼성병원</dutyName><dutyTel1>02-2001-2001</dutyTel1><hpid>A1100006</hpid><latitude>37.568497631233825</latitude><longitude>126.96793805451702</longitude></item>
<item><cnt>106</cnt><distance>1.5</distance><dutyName>위치없는병원</dutyName></item>
</items><numOfRows>3</numOfRows><pageNo>1</pageNo><totalCount>106</totalCount></body></response>"""

KEY_ERROR_ANSWER = """<?xml version="1.0" encoding="UTF-8"?><OpenAPI_ServiceResponse><cmmMsgHeader>
<errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg><returnReasonCode>30</returnReasonCode>
</cmmMsgHeader></OpenAPI_ServiceResponse>"""


def test_hospitals_are_read_and_sorted_closest_first():
    hospitals = parse_hospitals(OK_ANSWER)
    assert [h["name"] for h in hospitals] == ["강북삼성병원", "서울적십자병원"]
    first = hospitals[0]
    assert first["distance_m"] == 910
    assert first["phone"] == "02-2001-2001" and first["kind"] == "종합병원"
    assert first["hpid"] == "A1100006"
    assert 37.5 < first["latitude"] < 37.6


def test_hospitals_without_a_location_are_skipped():
    names = [h["name"] for h in parse_hospitals(OK_ANSWER)]
    assert "위치없는병원" not in names


def test_a_key_problem_is_reported():
    with pytest.raises(EmergencyServiceError, match="NOT_REGISTERED"):
        parse_hospitals(KEY_ERROR_ANSWER)


def test_an_unreadable_answer_is_reported():
    with pytest.raises(EmergencyServiceError):
        parse_hospitals("<html>Service down</html")


def test_an_error_result_code_is_reported():
    answer = "<response><header><resultCode>22</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR.</resultMsg></header></response>"
    with pytest.raises(EmergencyServiceError, match="22"):
        parse_hospitals(answer)
