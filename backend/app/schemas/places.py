from pydantic import BaseModel


class RestroomRead(BaseModel):
    id: int
    name: str
    address: str | None
    address_en: str | None
    latitude: float
    longitude: float
    distance_m: int
    opening_hours: str | None
    phone: str | None
    accessible_toilets: int
    child_toilets: int
    has_nursing_room: bool
