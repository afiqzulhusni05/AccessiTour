import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.enums import Region, ServiceType, TransportPreference
from app.models.types import pg_enum, str_list


class Trip(Base):
    """One planned visit to Korea. It contains one or more segments."""

    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    tourist_id: Mapped[int] = mapped_column(
        ForeignKey("tourists.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TripSegment(Base):
    """One part of a trip: a city and a time period, e.g. Seoul 20 to 22 October."""

    __tablename__ = "trip_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)  # order within the trip

    region: Mapped[Region] = mapped_column(pg_enum(Region, "region"))
    service_type: Mapped[ServiceType] = mapped_column(
        pg_enum(ServiceType, "segment_service_type")
    )
    start_date: Mapped[dt.date]
    end_date: Mapped[dt.date]
    start_time: Mapped[dt.time | None]  # MICRO only
    end_time: Mapped[dt.time | None]  # MICRO only
    group_size: Mapped[int] = mapped_column(Integer, default=1)
    transport_preference: Mapped[TransportPreference] = mapped_column(
        pg_enum(TransportPreference, "transport_preference"),
        default=TransportPreference.NO_PREFERENCE,
    )
    attributes: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    budget: Mapped[int | None] = mapped_column(Integer)