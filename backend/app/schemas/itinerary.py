from typing import Optional

from pydantic import BaseModel


class ItineraryGenerateRequest(BaseModel):
    region: str
    start_date: str
    end_date: str
    service_type: str

    start_time: Optional[str] = None
    end_time: Optional[str] = None

    group_size: int
    transport_preference: str
    attributes: list[str]

    budget: Optional[int] = None

    preferred_language: str
    mobility_level: str
    dietary: list[str]

    dietary_notes: Optional[str] = None
    special_requests: Optional[str] = None

    guide_languages: list[str]