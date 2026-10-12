from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.enums import (
    AccessibilityExperience,
    Attribute,
    Gender,
    Language,
    Region,
    ServiceType,
    TransportOption,
)


class GuideProfileUpdate(BaseModel):
    gender: Gender
    description: str | None = Field(default=None, max_length=1000)
    languages: list[Language] = Field(min_length=1)
    regions: list[Region] = Field(min_length=1)
    attributes: list[Attribute] = Field(default_factory=list)
    accessibility_experience: list[AccessibilityExperience] = Field(default_factory=list)
    transport_options: list[TransportOption] = Field(default_factory=list)
    max_group_size: int = Field(default=4, ge=1, le=50)


class GuideServiceIn(BaseModel):
    service_type: ServiceType
    hourly_rate: int | None = Field(default=None, gt=0)
    min_hours: int | None = Field(default=None, ge=1, le=12)
    max_hours: int | None = Field(default=None, ge=1, le=12)
    daily_rate: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def check_fields(self):
        if self.service_type == ServiceType.MICRO:
            if None in (self.hourly_rate, self.min_hours, self.max_hours):
                raise ValueError("MICRO needs hourly_rate, min_hours and max_hours")
            if self.min_hours > self.max_hours:
                raise ValueError("min_hours cannot be more than max_hours")
            self.daily_rate = None
        else:
            if self.daily_rate is None:
                raise ValueError("FULL_DAY needs daily_rate")
            self.hourly_rate = None
            self.min_hours = None
            self.max_hours = None
        return self


class GuideServicesUpdate(BaseModel):
    services: list[GuideServiceIn] = Field(min_length=1)

    @model_validator(mode="after")
    def no_duplicates(self):
        types = [s.service_type for s in self.services]
        if len(types) != len(set(types)):
            raise ValueError("Each service type can only appear once")
        return self


class GuideServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    service_type: ServiceType
    hourly_rate: int | None
    min_hours: int | None
    max_hours: int | None
    daily_rate: int | None


class GuideProfileRead(GuideProfileUpdate):
    id: int
    user_id: int
    full_name: str
    verified: bool
    rating_average: float
    rating_count: int
    services: list[GuideServiceRead] = Field(default_factory=list)