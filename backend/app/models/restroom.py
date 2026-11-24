from sqlalchemy import Boolean, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PublicRestroom(Base):
    """A public restroom from the national public restroom dataset (data.go.kr).

    Loaded from the CSV file with scripts/import_restrooms.py, so nearby
    restrooms can be found without calling any outside API.
    """

    __tablename__ = "public_restrooms"
    __table_args__ = (Index("ix_public_restrooms_lat_lng", "latitude", "longitude"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[str] = mapped_column(String(40), unique=True)  # ESNTL_ID in the file
    name: Mapped[str] = mapped_column(String(200))
    province: Mapped[str | None] = mapped_column(String(50))  # 시도, e.g. 서울특별시
    district: Mapped[str | None] = mapped_column(String(50))  # 시군구, e.g. 은평구
    address: Mapped[str | None] = mapped_column(Text)  # road-name address in Korean
    address_en: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    phone: Mapped[str | None] = mapped_column(String(40))
    opening_hours: Mapped[str | None] = mapped_column(String(200))  # as written, e.g. 24시간
    managed_by: Mapped[str | None] = mapped_column(String(200))
    accessible_toilets: Mapped[int] = mapped_column(Integer, default=0)  # for disabled people
    child_toilets: Mapped[int] = mapped_column(Integer, default=0)
    has_nursing_room: Mapped[bool] = mapped_column(Boolean, default=False)
    data_updated: Mapped[str | None] = mapped_column(String(8))  # YYYYMMDD in the file
