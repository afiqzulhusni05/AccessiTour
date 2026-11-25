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


class RestaurantRead(BaseModel):
    content_id: str | None
    name: str  # English name, usually with the Korean name in brackets
    cuisine: str  # Korean, Western, Japanese, Chinese, International, Cafe, Bar or Restaurant
    address: str | None  # English address
    phone: str | None
    latitude: float
    longitude: float
    distance_m: int | None
    image_url: str | None
    thumbnail_url: str | None


class SightRead(BaseModel):
    content_id: str | None
    name: str  # English name, usually with the Korean name in brackets
    kind: str  # Tourist attraction or Cultural site
    address: str | None
    phone: str | None
    latitude: float
    longitude: float
    distance_m: int | None
    image_url: str | None
    thumbnail_url: str | None
