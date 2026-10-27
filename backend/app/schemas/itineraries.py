import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.enums import BookingStatus, EditedBy, Region
from app.schemas.booking import TouristBrief
from app.schemas.matching import GuideSummary

Progress = Literal["UPCOMING", "ON_THE_WAY", "VISITED", "SKIPPED"]
Transport = Literal["TRANSIT", "WALK", "CAR", "BICYCLE"]
Meal = Literal["LUNCH", "DINNER"]


class ItineraryCreate(BaseModel):
    booking_id: int


class ItemIn(BaseModel):
    """A stop as the tourist or guide enters it. The date must fall inside the booking."""

    date: dt.date
    start_time: dt.time
    end_time: dt.time | None = None  # defaults to start_time: no length set
    place_name: str = Field(min_length=1, max_length=200)
    activity: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    transport: Transport | None = None
    meal: Meal | None = None

    @model_validator(mode="after")
    def check_times(self):
        if self.end_time is None:
            self.end_time = self.start_time
        if self.end_time < self.start_time:
            raise ValueError("end_time cannot be before start_time")
        return self


class ItemUpdate(BaseModel):
    """Only the fields that are sent change. Send transport/meal as null to clear them."""

    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    place_name: str | None = Field(default=None, min_length=1, max_length=200)
    activity: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    transport: Transport | None = None
    meal: Meal | None = None


class ProgressUpdate(BaseModel):
    progress: Progress


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    item_id: int | None = None  # None = a message about the whole itinerary


class ItemRead(BaseModel):
    id: int
    date: dt.date
    start_time: dt.time
    end_time: dt.time
    place_name: str
    activity: str | None
    latitude: float | None
    longitude: float | None
    edited_by: EditedBy
    progress: Progress
    transport: Transport | None
    meal: Meal | None
    needs_accessibility_check: bool


class CommentRead(BaseModel):
    id: int
    item_id: int | None
    author: Literal["TOURIST", "GUIDE"]
    author_name: str
    body: str
    created_at: dt.datetime


class ItineraryRead(BaseModel):
    id: int
    booking_id: int
    booking_status: BookingStatus
    trip_id: int
    region: Region
    start_date: dt.date
    end_date: dt.date
    group_size: int
    tourist: TouristBrief
    guide: GuideSummary
    you_are: Literal["TOURIST", "GUIDE"]
    accessibility_review: bool  # the tourist has mobility needs, so the guide checks the stops
    approved_by_tourist: bool
    approved_by_guide: bool
    items: list[ItemRead]
    comments: list[CommentRead]


class ItinerarySummary(BaseModel):
    id: int
    booking_id: int
    trip_id: int
    region: Region
    start_date: dt.date
    end_date: dt.date
    tourist_name: str
    guide_name: str
    stops: int
    approved_by_tourist: bool
    approved_by_guide: bool
