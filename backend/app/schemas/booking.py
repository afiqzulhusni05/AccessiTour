import datetime as dt

from pydantic import BaseModel

from app.enums import BookingStatus, Language, MobilityLevel, Region, ServiceType
from app.schemas.matching import GuideSummary


class BookingCreate(BaseModel):
    segment_id: int
    guide_id: int


class TouristBrief(BaseModel):
    """What a guide sees about the tourist who booked them."""

    id: int
    full_name: str
    nationality: str | None
    preferred_language: Language
    mobility_level: MobilityLevel


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
    created_at: dt.datetime
    updated_at: dt.datetime
