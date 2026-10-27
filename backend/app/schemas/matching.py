import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.enums import (
    AccessibilityExperience,
    Attribute,
    Gender,
    Language,
    Region,
    ServiceType,
    TransportOption,
    TransportPreference,
)

MAX_SEGMENT_DAYS = 14


class MatchRequest(BaseModel):
    region: Region
    service_type: ServiceType
    start_date: dt.date
    end_date: dt.date | None = None  # FULL_DAY only; defaults to start_date
    start_time: dt.time | None = None  # MICRO only
    end_time: dt.time | None = None  # MICRO only
    group_size: int = Field(default=1, ge=1, le=50)
    transport_preference: TransportPreference = TransportPreference.NO_PREFERENCE
    attributes: list[Attribute] = Field(default_factory=list)
    budget: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def check_dates_and_times(self):
        if self.service_type == ServiceType.MICRO:
            if self.start_time is None or self.end_time is None:
                raise ValueError("MICRO needs start_time and end_time")
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
            self.end_date = self.start_date  # a micro booking is always one day
        else:
            self.start_time = None
            self.end_time = None
            if self.end_date is None:
                self.end_date = self.start_date
            if self.end_date < self.start_date:
                raise ValueError("end_date cannot be before start_date")
            if (self.end_date - self.start_date).days + 1 > MAX_SEGMENT_DAYS:
                raise ValueError(f"A segment can be at most {MAX_SEGMENT_DAYS} days")
        return self


class FactorScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    factor: str
    weight: int
    score: float
    points: float
    reason: str


class GuideSummary(BaseModel):
    id: int
    full_name: str
    gender: Gender
    languages: list[Language]
    regions: list[Region]
    attributes: list[Attribute]
    accessibility_experience: list[AccessibilityExperience]
    transport_options: list[TransportOption]
    verified: bool
    rating_average: float
    rating_count: int


class MatchItem(BaseModel):
    guide: GuideSummary
    total_score: float
    estimated_price: int
    breakdown: list[FactorScoreRead]


class ExcludedItem(BaseModel):
    guide_id: int
    full_name: str
    reason: str


class MatchResponse(BaseModel):
    total: int
    items: list[MatchItem]
    excluded: list[ExcludedItem]
