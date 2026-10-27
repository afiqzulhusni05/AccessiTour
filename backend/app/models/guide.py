import datetime as dt

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.enums import Gender, ServiceType
from app.models.types import pg_enum, str_list


class Guide(Base):
    __tablename__ = "guides"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    gender: Mapped[Gender] = mapped_column(pg_enum(Gender, "gender"))
    description: Mapped[str | None] = mapped_column(Text)
    languages: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    regions: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    attributes: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    accessibility_experience: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    transport_options: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    max_group_size: Mapped[int] = mapped_column(Integer, default=4)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    rating_average: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class GuideService(Base):
    __tablename__ = "guide_services"
    __table_args__ = (UniqueConstraint("guide_id", "service_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    guide_id: Mapped[int] = mapped_column(
        ForeignKey("guides.id", ondelete="CASCADE"), index=True
    )
    service_type: Mapped[ServiceType] = mapped_column(
        pg_enum(ServiceType, "service_type")
    )

    # MICRO only
    hourly_rate: Mapped[int | None] = mapped_column(Integer)
    min_hours: Mapped[int | None] = mapped_column(Integer)
    max_hours: Mapped[int | None] = mapped_column(Integer)

    # FULL_DAY only
    daily_rate: Mapped[int | None] = mapped_column(Integer)


class GuideAvailability(Base):
    __tablename__ = "guide_availability"

    id: Mapped[int] = mapped_column(primary_key=True)
    guide_id: Mapped[int] = mapped_column(
        ForeignKey("guides.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt.date]
    start_time: Mapped[dt.time]
    end_time: Mapped[dt.time]