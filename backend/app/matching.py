"""Weighted guide matching.

Pure Python with no database code, so it can be tested on its own.
The endpoint loads tourists and guides from the database, turns them into
the dataclasses below, and calls match_guides().

How it works:
1. Exclude guides who cannot take the booking at all:
   - do not work in the requested region
   - not free on any requested day (or not free for the requested hours)
   - do not offer the requested service type, or not for that many hours
   - the group is larger than their maximum group size
2. Score every remaining guide from 0 to 1 on each factor, multiply by the
   factor's weight, and add up to a total out of 100.
3. Sort by total score, best first.
"""

import datetime as dt
from dataclasses import dataclass, field

from app.enums import (
    AccessibilityExperience,
    GenderPreference,
    MobilityLevel,
    ServiceType,
    TransportOption,
    TransportPreference,
)

# They add up to 100 and can be tuned during testing.
# Region is not scored: guides outside the requested region are excluded instead,
# and its former 20 points went to language, needs and specialities.
WEIGHTS = {
    "language": 25,
    "availability": 15,
    "needs": 25,
    "specialities": 15,
    "price": 10,
    "rating": 10,
}

SHARED_LANGUAGE_SCORE = 0.6  # guide doesn't speak the preferred language but shares another
FULL_DAY_MIN_HOURS = 6  # a free period this long counts as a full day
PRICE_ZERO_AT = 1.5  # price score falls to 0 at 1.5 x budget
RATING_PRIOR_AVERAGE = 4.0  # assumed rating for guides with few reviews
RATING_PRIOR_WEIGHT = 5  # how many "imaginary reviews" the prior counts as


# ---------- Inputs ----------


@dataclass
class TouristNeeds:
    preferred_language: str
    languages: list[str]
    mobility_level: MobilityLevel = MobilityLevel.NORMAL
    gender_preference: GenderPreference = GenderPreference.NO_PREFERENCE


@dataclass
class SegmentRequest:
    region: str
    service_type: ServiceType
    start_date: dt.date
    end_date: dt.date
    group_size: int = 1
    start_time: dt.time | None = None  # MICRO only
    end_time: dt.time | None = None  # MICRO only
    transport_preference: TransportPreference = TransportPreference.NO_PREFERENCE
    attributes: list[str] = field(default_factory=list)
    budget: int | None = None  # total guide fee for the segment, in won

    def days(self) -> list[dt.date]:
        count = (self.end_date - self.start_date).days + 1
        return [self.start_date + dt.timedelta(days=i) for i in range(count)]

    def micro_hours(self) -> float:
        start = dt.datetime.combine(self.start_date, self.start_time)
        end = dt.datetime.combine(self.start_date, self.end_time)
        return (end - start).total_seconds() / 3600


@dataclass
class ServiceInfo:
    hourly_rate: int | None = None
    min_hours: int | None = None
    max_hours: int | None = None
    daily_rate: int | None = None


@dataclass
class GuideCandidate:
    id: int
    full_name: str
    gender: str
    languages: list[str]
    regions: list[str]
    attributes: list[str]
    accessibility_experience: list[str]
    transport_options: list[str]
    max_group_size: int
    rating_average: float
    rating_count: int
    services: dict[ServiceType, ServiceInfo]
    availability: list[tuple[dt.date, dt.time, dt.time]]


# ---------- Outputs ----------


@dataclass
class FactorScore:
    factor: str
    weight: int
    score: float
    points: float
    reason: str


@dataclass
class MatchResult:
    guide: GuideCandidate
    total_score: float
    estimated_price: int
    breakdown: list[FactorScore]


@dataclass
class Exclusion:
    guide: GuideCandidate
    reason: str


# ---------- Helpers ----------


def hours_between(start: dt.time, end: dt.time) -> float:
    day = dt.date(2000, 1, 1)
    delta = dt.datetime.combine(day, end) - dt.datetime.combine(day, start)
    return delta.total_seconds() / 3600


def free_days(guide: GuideCandidate, segment: SegmentRequest) -> list[dt.date]:
    """Requested days on which the guide can take this booking."""
    slots_by_day: dict[dt.date, list[tuple[dt.time, dt.time]]] = {}
    for day, start, end in guide.availability:
        slots_by_day.setdefault(day, []).append((start, end))

    result = []
    for day in segment.days():
        slots = slots_by_day.get(day, [])
        if segment.service_type == ServiceType.MICRO:
            fits = any(
                start <= segment.start_time and end >= segment.end_time
                for start, end in slots
            )
        else:
            fits = any(hours_between(start, end) >= FULL_DAY_MIN_HOURS for start, end in slots)
        if fits:
            result.append(day)
    return result


def estimate_price(service: ServiceInfo, segment: SegmentRequest) -> int:
    if segment.service_type == ServiceType.MICRO:
        return round(service.hourly_rate * segment.micro_hours())
    return service.daily_rate * len(segment.days())


def exclusion_reason(guide: GuideCandidate, segment: SegmentRequest) -> str | None:
    if segment.region not in guide.regions:
        return f"Does not work in {segment.region.title()}"

    service = guide.services.get(segment.service_type)
    if service is None:
        return f"Does not offer {segment.service_type.value}"

    if segment.service_type == ServiceType.MICRO:
        hours = segment.micro_hours()
        if not service.min_hours <= hours <= service.max_hours:
            return (
                f"Takes {service.min_hours} to {service.max_hours} hour bookings, "
                f"requested {hours:g}"
            )

    if segment.group_size > guide.max_group_size:
        return f"Takes groups of up to {guide.max_group_size}, requested {segment.group_size}"

    if not free_days(guide, segment):
        if segment.service_type == ServiceType.MICRO:
            return (
                f"Not free {segment.start_time:%H:%M} to {segment.end_time:%H:%M} "
                f"on {segment.start_date:%d %b}"
            )
        return f"Not free for a full day ({FULL_DAY_MIN_HOURS}+ hours) on the requested dates"

    return None


# ---------- Factor scores (each returns a score from 0 to 1 and a reason) ----------


def score_language(guide: GuideCandidate, tourist: TouristNeeds) -> tuple[float, str]:
    if tourist.preferred_language in guide.languages:
        return 1.0, f"Speaks your preferred language ({tourist.preferred_language})"
    shared = [lang for lang in tourist.languages if lang in guide.languages]
    if shared:
        return SHARED_LANGUAGE_SCORE, f"Shares {', '.join(shared)}, not your preferred language"
    return 0.0, "No shared language"


def score_availability(guide: GuideCandidate, segment: SegmentRequest) -> tuple[float, str]:
    wanted = len(segment.days())
    free = len(free_days(guide, segment))
    if free == wanted:
        return 1.0, "Free for the whole time requested"
    return free / wanted, f"Free on {free} of {wanted} days"


def score_needs(
    guide: GuideCandidate, tourist: TouristNeeds, segment: SegmentRequest
) -> tuple[float, str]:
    # Each check: (met?, text when met, text when not met)
    checks: list[tuple[bool, str, str]] = []

    if tourist.mobility_level == MobilityLevel.WHEELCHAIR:
        ok = AccessibilityExperience.WHEELCHAIR_SUPPORT.value in guide.accessibility_experience
        checks.append((ok, "wheelchair support", "no wheelchair support"))
    elif tourist.mobility_level == MobilityLevel.SLOW_WALK:
        ok = any(
            tag in guide.accessibility_experience
            for tag in (
                AccessibilityExperience.SLOW_WALK_SUPPORT.value,
                AccessibilityExperience.WHEELCHAIR_SUPPORT.value,
            )
        )
        checks.append((ok, "slow walking support", "no slow walking support"))

    if segment.transport_preference == TransportPreference.PRIVATE:
        ok = any(
            option in guide.transport_options
            for option in (
                TransportOption.OWN_CAR.value,
                TransportOption.CAN_ARRANGE_CAR.value,
            )
        )
        checks.append((ok, "private transport", "no private transport"))

    if tourist.gender_preference != GenderPreference.NO_PREFERENCE:
        wanted = tourist.gender_preference.value.lower()
        ok = guide.gender == tourist.gender_preference.value
        checks.append((ok, f"{wanted} guide", f"not a {wanted} guide"))

    if not checks:
        return 1.0, "No special needs requested"

    met = sum(1 for ok, _, _ in checks if ok)
    parts = [met_text if ok else missing_text for ok, met_text, missing_text in checks]
    reason = ", ".join(parts)
    return met / len(checks), reason[0].upper() + reason[1:]


def score_specialities(guide: GuideCandidate, segment: SegmentRequest) -> tuple[float, str]:
    if not segment.attributes:
        return 1.0, "No specialities requested"
    matched = [a for a in segment.attributes if a in guide.attributes]
    if not matched:
        return 0.0, "None of your interests"
    score = len(matched) / len(segment.attributes)
    return score, f"Matches {', '.join(a.title() for a in matched)}"


def score_price(price: int, segment: SegmentRequest) -> tuple[float, str]:
    if segment.budget is None:
        return 1.0, f"{price:,} won (no budget set)"
    if price <= segment.budget:
        return 1.0, f"{price:,} won, within budget"
    limit = segment.budget * PRICE_ZERO_AT
    if price >= limit:
        return 0.0, f"{price:,} won, well over budget"
    score = (limit - price) / (limit - segment.budget)
    return score, f"{price:,} won, over budget"


def score_rating(guide: GuideCandidate) -> tuple[float, str]:
    adjusted = (
        guide.rating_average * guide.rating_count + RATING_PRIOR_AVERAGE * RATING_PRIOR_WEIGHT
    ) / (guide.rating_count + RATING_PRIOR_WEIGHT)
    if guide.rating_count == 0:
        return adjusted / 5, "No reviews yet"
    return adjusted / 5, f"{guide.rating_average:.1f} from {guide.rating_count} reviews"


# ---------- Main function ----------


def match_guides(
    tourist: TouristNeeds,
    segment: SegmentRequest,
    guides: list[GuideCandidate],
    weights: dict[str, int] = WEIGHTS,
) -> tuple[list[MatchResult], list[Exclusion]]:
    results: list[MatchResult] = []
    excluded: list[Exclusion] = []

    for guide in guides:
        reason = exclusion_reason(guide, segment)
        if reason is not None:
            excluded.append(Exclusion(guide=guide, reason=reason))
            continue

        price = estimate_price(guide.services[segment.service_type], segment)
        scores = {
            "language": score_language(guide, tourist),
            "availability": score_availability(guide, segment),
            "needs": score_needs(guide, tourist, segment),
            "specialities": score_specialities(guide, segment),
            "price": score_price(price, segment),
            "rating": score_rating(guide),
        }

        breakdown = [
            FactorScore(
                factor=name,
                weight=weights[name],
                score=round(score, 2),
                points=round(score * weights[name], 1),
                reason=reason,
            )
            for name, (score, reason) in scores.items()
        ]
        total = round(sum(score * weights[name] for name, (score, _) in scores.items()), 1)
        results.append(
            MatchResult(guide=guide, total_score=total, estimated_price=price, breakdown=breakdown)
        )

    results.sort(key=lambda r: (-r.total_score, r.estimated_price, r.guide.id))
    return results, excluded