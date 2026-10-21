"""Tests for the matching algorithm, including the three scenarios in
section 2.7 of the project report.

Run from the backend folder:  pytest -v
"""

import datetime as dt

from app.enums import (
    GenderPreference,
    MobilityLevel,
    ServiceType,
    TransportPreference,
)
from app.matching import (
    GuideCandidate,
    ServiceInfo,
    SegmentRequest,
    TouristNeeds,
    match_guides,
)

NOV_3 = dt.date(2026, 11, 3)
NOV_4 = dt.date(2026, 11, 4)
NOV_5 = dt.date(2026, 11, 5)


def full_days(*days):
    return [(day, dt.time(9), dt.time(18)) for day in days]


def guide(id, name, **overrides):
    """A Busan guide, free 3 to 5 November, offering both services."""
    values = dict(
        id=id,
        full_name=name,
        gender="FEMALE",
        languages=["ko", "en"],
        regions=["BUSAN"],
        attributes=["FOOD", "CULTURE"],
        accessibility_experience=[],
        transport_options=["PUBLIC_TRANSIT"],
        max_group_size=6,
        rating_average=4.5,
        rating_count=30,
        services={
            ServiceType.MICRO: ServiceInfo(hourly_rate=20000, min_hours=2, max_hours=4),
            ServiceType.FULL_DAY: ServiceInfo(daily_rate=120000),
        },
        availability=full_days(NOV_3, NOV_4, NOV_5),
    )
    values.update(overrides)
    return GuideCandidate(**values)


# Based on the sample guides in data/sample_guides.csv
MINHO = guide(
    1, "Minho", gender="MALE", rating_average=4.5, rating_count=40,
    services={
        ServiceType.MICRO: ServiceInfo(hourly_rate=15000, min_hours=2, max_hours=4),
        ServiceType.FULL_DAY: ServiceInfo(daily_rate=90000),
    },
)
JISU = guide(
    2, "Jisu", attributes=["FOOD", "NATURE"],
    accessibility_experience=["SLOW_WALK_SUPPORT", "SENIOR_SUPPORT", "FIRST_AID"],
    transport_options=["PUBLIC_TRANSIT", "OWN_CAR"], max_group_size=4,
    rating_average=4.9, rating_count=60,
    services={
        ServiceType.MICRO: ServiceInfo(hourly_rate=25000, min_hours=2, max_hours=4),
        ServiceType.FULL_DAY: ServiceInfo(daily_rate=150000),
    },
)
HANA = guide(
    3, "Hana", languages=["ko", "ja", "en"], attributes=["CULTURE", "HISTORY", "FOOD"],
    rating_average=4.7, rating_count=30,
    services={ServiceType.FULL_DAY: ServiceInfo(daily_rate=120000)},
)
SORA = guide(
    4, "Sora", languages=["ko", "ja"], attributes=["CULTURE", "HISTORY"], max_group_size=4,
    rating_average=4.6, rating_count=25,
    services={ServiceType.MICRO: ServiceInfo(hourly_rate=20000, min_hours=2, max_hours=3)},
)
YUNA = guide(
    5, "Yuna",
    accessibility_experience=["WHEELCHAIR_SUPPORT", "SLOW_WALK_SUPPORT", "FIRST_AID"],
    transport_options=["PUBLIC_TRANSIT", "CAN_ARRANGE_CAR"], max_group_size=4,
    rating_average=4.8, rating_count=50,
    services={
        ServiceType.MICRO: ServiceInfo(hourly_rate=30000, min_hours=2, max_hours=4),
        ServiceType.FULL_DAY: ServiceInfo(daily_rate=160000),
    },
)
SEOUL_GUIDE = guide(6, "Seojun", regions=["SEOUL"], rating_average=4.9, rating_count=80)

ALL_GUIDES = [MINHO, JISU, HANA, SORA, YUNA, SEOUL_GUIDE]

ENGLISH_SPEAKER = TouristNeeds(preferred_language="en", languages=["en"])


def full_day_in_busan(**overrides):
    values = dict(
        region="BUSAN",
        service_type=ServiceType.FULL_DAY,
        start_date=NOV_3,
        end_date=NOV_3,
        group_size=2,
        attributes=["FOOD"],
    )
    values.update(overrides)
    return SegmentRequest(**values)


def names(results):
    return [r.guide.full_name for r in results]


# ---------- Report section 2.7 scenarios ----------


def test_case_1_normal_walking_english_low_budget():
    results, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(budget=100000), ALL_GUIDES)

    # The cheapest guide wins, even though Jisu and Yuna have better ratings
    assert names(results)[0] == "Minho"
    assert names(results).index("Minho") < names(results).index("Jisu")
    assert names(results).index("Minho") < names(results).index("Yuna")


def test_case_2_slow_walking_english_high_accessibility():
    tourist = TouristNeeds(
        preferred_language="en", languages=["en"], mobility_level=MobilityLevel.SLOW_WALK
    )
    results, _ = match_guides(tourist, full_day_in_busan(budget=200000), ALL_GUIDES)

    # The two guides with slow walking support come first
    assert set(names(results)[:2]) == {"Jisu", "Yuna"}
    assert names(results).index("Minho") > 1


def test_case_2_wheelchair_puts_yuna_first():
    tourist = TouristNeeds(
        preferred_language="en", languages=["en"], mobility_level=MobilityLevel.WHEELCHAIR
    )
    results, _ = match_guides(tourist, full_day_in_busan(budget=200000), ALL_GUIDES)

    assert names(results)[0] == "Yuna"


def test_case_3_japanese_speaker_interested_in_culture():
    tourist = TouristNeeds(preferred_language="ja", languages=["ja", "en"])
    segment = full_day_in_busan(attributes=["CULTURE", "HISTORY"], budget=150000)
    results, excluded = match_guides(tourist, segment, ALL_GUIDES)

    assert names(results)[0] == "Hana"
    # Sora speaks Japanese but only offers MICRO, so she cannot take a full day
    assert "Sora" in [e.guide.full_name for e in excluded]


def test_case_3_micro_booking_includes_sora():
    tourist = TouristNeeds(preferred_language="ja", languages=["ja", "en"])
    segment = full_day_in_busan(
        service_type=ServiceType.MICRO,
        start_time=dt.time(13),
        end_time=dt.time(16),
        attributes=["CULTURE", "HISTORY"],
    )
    results, _ = match_guides(tourist, segment, ALL_GUIDES)

    assert names(results)[0] == "Sora"


def test_rankings_change_when_conditions_change():
    """Success criterion 1 in the report: same region and dates, different needs,
    different top guide."""
    low_budget, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(budget=100000), ALL_GUIDES)
    wheelchair, _ = match_guides(
        TouristNeeds(
            preferred_language="en", languages=["en"], mobility_level=MobilityLevel.WHEELCHAIR
        ),
        full_day_in_busan(budget=200000),
        ALL_GUIDES,
    )
    japanese, _ = match_guides(
        TouristNeeds(preferred_language="ja", languages=["ja", "en"]),
        full_day_in_busan(attributes=["CULTURE", "HISTORY"], budget=150000),
        ALL_GUIDES,
    )

    tops = {names(low_budget)[0], names(wheelchair)[0], names(japanese)[0]}
    assert tops == {"Minho", "Yuna", "Hana"}


# ---------- Exclusions ----------


def test_group_too_big_is_excluded():
    _, excluded = match_guides(ENGLISH_SPEAKER, full_day_in_busan(group_size=5), ALL_GUIDES)
    excluded_names = [e.guide.full_name for e in excluded]

    assert {"Jisu", "Yuna"} <= set(excluded_names)  # both take at most 4
    assert "Minho" not in excluded_names


def test_not_free_is_excluded():
    segment = full_day_in_busan(start_date=dt.date(2026, 12, 1), end_date=dt.date(2026, 12, 1))
    results, excluded = match_guides(ENGLISH_SPEAKER, segment, ALL_GUIDES)

    assert results == []
    assert all(
        e.reason.startswith("Not free") or "Does not" in e.reason for e in excluded
    )


def test_micro_must_fit_inside_free_hours():
    morning_only = guide(10, "Morning", availability=[(NOV_3, dt.time(9), dt.time(13))])
    segment = full_day_in_busan(
        service_type=ServiceType.MICRO, start_time=dt.time(14), end_time=dt.time(16)
    )
    results, excluded = match_guides(ENGLISH_SPEAKER, segment, [morning_only])

    assert results == []
    assert excluded[0].reason == "Not free 14:00 to 16:00 on 03 Nov"


def test_micro_hours_outside_guide_range_is_excluded():
    segment = full_day_in_busan(
        service_type=ServiceType.MICRO, start_time=dt.time(9), end_time=dt.time(15)
    )  # 6 hours, but guides take at most 4
    results, excluded = match_guides(ENGLISH_SPEAKER, segment, [MINHO])

    assert results == []
    assert "hour bookings" in excluded[0].reason


def test_wrong_region_is_excluded():
    results, excluded = match_guides(ENGLISH_SPEAKER, full_day_in_busan(), ALL_GUIDES)

    # A Seoul-only guide never appears in Busan results
    assert "Seojun" not in names(results)
    seojun = next(e for e in excluded if e.guide.full_name == "Seojun")
    assert seojun.reason == "Does not work in Busan"


def test_region_is_not_a_scored_factor():
    results, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(), ALL_GUIDES)
    factors = [f.factor for f in results[0].breakdown]

    assert "region" not in factors
    assert sum(f.weight for f in results[0].breakdown) == 100


def test_guide_in_several_regions_appears_in_each():
    both_cities = guide(12, "Both", regions=["SEOUL", "BUSAN"])
    seoul = full_day_in_busan(region="SEOUL")
    for segment in (full_day_in_busan(), seoul):
        results, _ = match_guides(ENGLISH_SPEAKER, segment, [both_cities])
        assert names(results) == ["Both"]


# ---------- Individual factors ----------


def test_scores_add_up_to_total():
    results, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(budget=100000), ALL_GUIDES)
    for result in results:
        assert abs(sum(f.points for f in result.breakdown) - result.total_score) < 0.5
        assert 0 <= result.total_score <= 100


def test_shared_language_gets_partial_score():
    tourist = TouristNeeds(preferred_language="ja", languages=["ja", "en"])
    results, _ = match_guides(tourist, full_day_in_busan(), [MINHO])
    language = next(f for f in results[0].breakdown if f.factor == "language")

    assert language.score == 0.6


def test_private_transport_and_gender_count_as_needs():
    tourist = TouristNeeds(
        preferred_language="en",
        languages=["en"],
        gender_preference=GenderPreference.FEMALE,
    )
    segment = full_day_in_busan(transport_preference=TransportPreference.PRIVATE)
    results, _ = match_guides(tourist, segment, [MINHO, JISU])
    needs = {r.guide.full_name: next(f for f in r.breakdown if f.factor == "needs")
             for r in results}

    assert needs["Jisu"].score == 1.0  # female, has a car
    assert needs["Minho"].score == 0.0  # male, no car
    assert needs["Minho"].reason == "No private transport, not a female guide"


def test_no_budget_gives_full_price_score():
    results, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(budget=None), [YUNA])
    price = next(f for f in results[0].breakdown if f.factor == "price")

    assert price.score == 1.0


def test_price_for_multi_day_and_micro():
    three_days = full_day_in_busan(end_date=NOV_5)
    results, _ = match_guides(ENGLISH_SPEAKER, three_days, [MINHO])
    assert results[0].estimated_price == 270000  # 90,000 x 3 days

    micro = full_day_in_busan(
        service_type=ServiceType.MICRO, start_time=dt.time(13), end_time=dt.time(16)
    )
    results, _ = match_guides(ENGLISH_SPEAKER, micro, [MINHO])
    assert results[0].estimated_price == 45000  # 15,000 x 3 hours


def test_partly_free_guide_gets_partial_availability():
    partly_free = guide(11, "Partly", availability=full_days(NOV_3, NOV_4))
    results, _ = match_guides(ENGLISH_SPEAKER, full_day_in_busan(end_date=NOV_5), [partly_free])
    availability = next(f for f in results[0].breakdown if f.factor == "availability")

    assert availability.score == 0.67
    assert availability.reason == "Free on 2 of 3 days"