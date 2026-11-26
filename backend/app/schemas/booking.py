import datetime as dt

from pydantic import BaseModel, model_validator

from app.enums import BookingStatus, Language, MobilityLevel, Region, ServiceType
from app.schemas.matching import GuideSummary


class BookingCreate(BaseModel):
    segment_id: int
    guide_id: int
    # Optional: book the guide for only part of the segment. Both, or neither.
    start_date: dt.date | None = None
    end_date: dt.date | None = None

    @model_validator(mode="after")
    def both_dates_or_neither(self):
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("Give both start_date and end_date, or neither")
        if self.start_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self



class TouristBrief(BaseModel):
    """What a guide sees about the tourist who booked them."""

    id: int
    full_name: str
    nationality: str | None
    preferred_language: Language
    mobility_level: MobilityLevel
    photo_url: str | None = None


class BookingRead(BaseModel):
    id: int
    status: BookingStatus
    trip_id: int
    segment_id: int
    region: Region
    service_type: ServiceType
    start_date: dt.date
    end_date: dt.date
    start_time: dt.time | None
    end_time: dt.time | None
    group_size: int
    total_price: int
    guide: GuideSummary
    tourist: TouristBrief
    paid_at: dt.datetime | None = None
    created_at: dt.datetime
    updated_at: dt.datetime
