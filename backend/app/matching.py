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
from dataclasses import dataclass, field, replace

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


# ---------- Whole trip (several segments) ----------


@dataclass
class WholeTripResult:
    guide: GuideCandidate
    segments_covered: int
    segments_total: int
    average_score: float  # segments the guide can't take count as 0
    total_price: int  # only the segments the guide can take
    segment_scores: list[float | None]  # one per segment, None if not covered


def combine_whole_trip(per_segment: list[list[MatchResult]]) -> list[WholeTripResult]:
    """Combine each segment's ranked list into one list of guides for the whole trip.

    Guides who can take every segment come first. Guides who can take only some
    segments are still listed (agreed option B), with 0 for the segments they
    can't take, so their average is lower.
    """
    total = len(per_segment)
    hits_by_guide: dict[int, dict[int, MatchResult]] = {}
    for index, results in enumerate(per_segment):
        for result in results:
            hits_by_guide.setdefault(result.guide.id, {})[index] = result

    combined = []
    for hits in hits_by_guide.values():
        scores = [hits[i].total_score if i in hits else None for i in range(total)]
        combined.append(
            WholeTripResult(
                guide=next(iter(hits.values())).guide,
                segments_covered=len(hits),
                segments_total=total,
                average_score=round(sum(s or 0 for s in scores) / total, 1),
                total_price=sum(h.estimated_price for h in hits.values()),
                segment_scores=scores,
            )
        )

    combined.sort(
        key=lambda w: (-w.segments_covered, -w.average_score, w.total_price, w.guide.id)
    )
    return combined

# ---------- One segment shared between several guides ----------


@dataclass
class CoverageOption:
    guide: GuideCandidate
    score: float
    price: int  # for this block's days only


@dataclass
class CoverageBlock:
    start_date: dt.date
    end_date: dt.date
    options: list[CoverageOption]  # options[0] is the suggested guide; the rest can take the same days


@dataclass
class CoveragePlan:
    blocks: list[CoverageBlock]
    uncovered_days: list[dt.date]
    total_price: int  # suggested guides only

    @property
    def single_guide(self) -> bool:
        return len(self.blocks) == 1 and not self.uncovered_days


def plan_coverage(
    segment: SegmentRequest,
    results: list[MatchResult],
    skip_days: set[dt.date] | None = None,
) -> CoveragePlan:
    """Cover a multi-day segment with as few guide changes as possible.

    `results` is match_guides() output (best score first). From the first day still
    needing a guide, pick the guide free for the longest unbroken run of days
    (ties go to the better score), then continue from the day after that run.
    Days in skip_days are already booked and are left out. Days nobody can take
    are returned in uncovered_days. FULL_DAY segments only.
    """
    skip = skip_days or set()
    days = segment.days()
    free = {r.guide.id: set(free_days(r.guide, segment)) - skip for r in results}

    blocks: list[CoverageBlock] = []
    uncovered: list[dt.date] = []
    i = 0
    while i < len(days):
        if days[i] in skip:
            i += 1
            continue

        best, best_run = None, 0
        for r in results:
            run = 0
            while i + run < len(days) and days[i + run] in free[r.guide.id]:
                run += 1
            if run > best_run:  # strict ">" keeps the higher score on a tie
                best, best_run = r, run

        if best is None:
            uncovered.append(days[i])
            i += 1
            continue

        block_days = set(days[i : i + best_run])
        block_segment = replace(segment, start_date=days[i], end_date=days[i + best_run - 1])
        options = [
            CoverageOption(
                guide=r.guide,
                score=r.total_score,
                price=estimate_price(r.guide.services[segment.service_type], block_segment),
            )
            for r in results
            if block_days <= free[r.guide.id]
        ]
        options.sort(key=lambda o: o.guide.id != best.guide.id)  # suggested guide first, rest stay by score
        blocks.append(
            CoverageBlock(start_date=block_segment.start_date, end_date=block_segment.end_date, options=options)
        )
        i += best_run

    return CoveragePlan(
        blocks=blocks,
        uncovered_days=uncovered,
        total_price=sum(b.options[0].price for b in blocks),
    )

# ---------- Connecting options (mixture of guide) ----------
#
# Guides free on every day are the "direct" options and stay at the top of the normal
# match list. When the stay is long, a mix of guides can still cover it, the way a
# transit flight still gets you there. connecting_options() suggests a few such mixes.

MAX_GUIDES_PER_PLAN = 4  # more handovers than this is too tiring for the tourist
CONNECTING_BRANCH = 4  # guides tried at each handover (keeps the search fast)
CONNECTING_LIMIT = 3  # options returned
CONNECTING_ALTERNATIVES = 3  # other guides shown for each leg


@dataclass
class ConnectingLeg:
    guide: GuideCandidate
    start_date: dt.date
    end_date: dt.date
    score: float  # the guide scored for this leg only, so being busy on other days costs nothing
    price: int
    alternatives: list["ConnectingLeg"] = field(default_factory=list)  # other guides free for the same days

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1


@dataclass
class ConnectingPlan:
    legs: list[ConnectingLeg]
    uncovered_days: list[dt.date]
    total_price: int
    average_score: float  # weighted by days, so a 7-day leg counts more than a 1-day leg

    @property
    def changes(self) -> int:
        return len(self.legs) - 1


def connecting_options(
    tourist: TouristNeeds,
    segment: SegmentRequest,
    results: list[MatchResult],
    skip_days: set[dt.date] | None = None,
    limit: int = CONNECTING_LIMIT,
) -> list[ConnectingPlan]:
    """A few ways to cover a multi-day FULL_DAY segment with several guides.

    `results` is match_guides() output. Each leg gives one guide an unbroken run of
    days. Plans are ranked like flight results: fewest uncovered days, then fewest
    guide changes, then best average score, then lowest price. Single-guide plans
    are left out, because those guides are already the direct options.
    Days in skip_days are already booked and are left out.
    """
    skip = skip_days or set()
    days = segment.days()
    by_id = {r.guide.id: r for r in results}
    free = {r.guide.id: set(free_days(r.guide, segment)) - skip for r in results}

    # 1. Search: from the first day still open, try the few guides with the longest runs.
    raw: list[tuple[list[tuple[int, int, int]], list[dt.date]]] = []  # (guide id, first, last day index)

    def run_length(guide_id: int, i: int) -> int:
        run = 0
        while i + run < len(days) and days[i + run] in free[guide_id]:
            run += 1
        return run

    def search(i: int, legs: list[tuple[int, int, int]], uncovered: list[dt.date]) -> None:
        while i < len(days) and days[i] in skip:
            i += 1
        if i == len(days):
            if legs:
                raw.append((legs, uncovered))
            return
        options = [(gid, run_length(gid, i)) for gid in free]
        options = [(gid, run) for gid, run in options if run > 0]
        if not options:  # nobody can take this day
            search(i + 1, legs, uncovered + [days[i]])
            return
        if len(legs) == MAX_GUIDES_PER_PLAN:
            return
        options.sort(key=lambda o: (-o[1], -by_id[o[0]].total_score, o[0]))
        for gid, run in options[:CONNECTING_BRANCH]:
            if legs and legs[-1][0] == gid:
                continue  # same guide again straight away is just a longer run
            search(i + run, legs + [(gid, i, i + run - 1)], uncovered)

    search(0, [], [])

    # 2. Score each distinct plan, rescoring every leg on its own days and budget share.
    leg_cache: dict[tuple[int, int, int], ConnectingLeg] = {}

    def leg(gid: int, first: int, last: int) -> ConnectingLeg:
        key = (gid, first, last)
        if key not in leg_cache:
            budget = None
            if segment.budget is not None:
                budget = round(segment.budget * (last - first + 1) / len(days))
            part = replace(segment, start_date=days[first], end_date=days[last], budget=budget)
            scored, _ = match_guides(tourist, part, [by_id[gid].guide])
            leg_cache[key] = ConnectingLeg(
                guide=by_id[gid].guide,
                start_date=days[first],
                end_date=days[last],
                score=scored[0].total_score,
                price=scored[0].estimated_price,
            )
        return leg_cache[key]

    # Plans that split the dates the same way are one option: keep its best guides,
    # and offer the other guides who are free for a leg as alternatives for it.
    plans: dict[tuple, tuple[ConnectingPlan, list[tuple[int, int, int]]]] = {}
    for legs, uncovered in raw:
        if len(legs) == 1 and not uncovered:
            continue  # a direct option
        built = [replace(leg(*l)) for l in legs]  # copies: alternatives are set on them below
        covered = sum(l.days for l in built)
        plan = ConnectingPlan(
            legs=built,
            uncovered_days=uncovered,
            total_price=sum(l.price for l in built),
            average_score=round(sum(l.score * l.days for l in built) / covered, 1),
        )
        split = tuple((first, last) for _, first, last in legs)
        best = plans.get(split)
        if best is None or (-plan.average_score, plan.total_price) < (-best[0].average_score, best[0].total_price):
            plans[split] = (plan, legs)

    ranked = sorted(
        plans.values(),
        key=lambda p: (len(p[0].uncovered_days), p[0].changes, -p[0].average_score, p[0].total_price),
    )[:limit]

    for plan, legs in ranked:
        for built, (gid, first, last) in zip(plan.legs, legs):
            leg_days = set(days[first : last + 1])
            others = [leg(other, first, last) for other in free if other != gid and leg_days <= free[other]]
            others.sort(key=lambda l: (-l.score, l.price, l.guide.id))
            built.alternatives = others[:CONNECTING_ALTERNATIVES]
    return [plan for plan, _ in ranked]


# ---------- Bookings ----------


def remove_booked(
    availability: list[tuple[dt.date, dt.time, dt.time]],
    booked: list[tuple[dt.date, dt.time | None, dt.time | None]],
) -> list[tuple[dt.date, dt.time, dt.time]]:
    """Take a guide's booked time out of their free slots.

    A booked entry with no times is a full-day booking and blocks the whole day.
    A MICRO booking cuts its hours out of the slot, which can split it in two.
    """
    booked_by_day: dict[dt.date, list] = {}
    for day, start, end in booked:
        booked_by_day.setdefault(day, []).append((start, end))

    result = []
    for day, slot_start, slot_end in availability:
        pieces = [(slot_start, slot_end)]
        for b_start, b_end in booked_by_day.get(day, []):
            if b_start is None:  # full day booked
                pieces = []
                break
            remaining = []
            for start, end in pieces:
                if b_end <= start or b_start >= end:  # no overlap
                    remaining.append((start, end))
                    continue
                if start < b_start:
                    remaining.append((start, b_start))
                if b_end < end:
                    remaining.append((b_end, end))
            pieces = remaining
        result.extend((day, start, end) for start, end in pieces)
    return result


def bookings_overlap(a, b) -> bool:
    """Whether two bookings (anything with start_date, end_date, start_time,
    end_time and service_type) need the guide at the same time."""
    if a.start_date > b.end_date or b.start_date > a.end_date:
        return False
    both_micro = a.service_type == ServiceType.MICRO and b.service_type == ServiceType.MICRO
    if both_micro:
        return a.start_time < b.end_time and b.start_time < a.end_time
    return True  # a full day on a shared date always clashes