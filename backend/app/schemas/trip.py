import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.enums import Attribute, Region, ServiceType, TransportPreference
from app.schemas.matching import ExcludedItem, GuideSummary, MatchItem, MatchRequest

MAX_SEGMENTS = 10


class SegmentIn(MatchRequest):
    """One part of a trip. Same fields and rules as a matching preview request."""


class TripCreate(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    segments: list[SegmentIn] = Field(min_length=1, max_length=MAX_SEGMENTS)

    @model_validator(mode="after")
    def no_overlaps(self):
        ordered = sorted(self.segments, key=lambda s: (s.start_date, s.start_time or dt.time(0)))
        for i, first in enumerate(ordered):
            for second in ordered[i + 1 :]:
                if second.start_date > first.end_date:
                    break  # sorted, so no later segment can overlap `first`
                both_micro = (
                    first.service_type == ServiceType.MICRO
                    and second.service_type == ServiceType.MICRO
                )
                if both_micro and (
                    second.start_time >= first.end_time or first.start_time >= second.end_time
                ):
                    continue  # two short sessions on the same day, at different times
                raise ValueError(
                    f"Segments overlap: {first.region.value} from {first.start_date} "
                    f"and {second.region.value} from {second.start_date}"
                )
        return self


class SegmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    region: Region
    service_type: ServiceType
    start_date: dt.date
    end_date: dt.date
    start_time: dt.time | None
    end_time: dt.time | None
    group_size: int
    transport_preference: TransportPreference
    attributes: list[Attribute]
    budget: int | None


class TripRead(BaseModel):
    id: int
    title: str | None
    start_date: dt.date
    end_date: dt.date
    created_at: dt.datetime
    segments: list[SegmentRead]


class SegmentMatches(BaseModel):
    segment: SegmentRead
    total: int
    items: list[MatchItem]
    excluded: list[ExcludedItem]


class SegmentScore(BaseModel):
    segment_id: int
    total_score: float | None  # None if the guide can't take this segment


class WholeTripItem(BaseModel):
    guide: GuideSummary
    segments_covered: int
    segments_total: int
    coverage: str
    average_score: float
    total_price: int
    segment_scores: list[SegmentScore]


class TripMatchResponse(BaseModel):
    trip_id: int
    segments: list[SegmentMatches]
    whole_trip: list[WholeTripItem]  # empty for a trip with one segment