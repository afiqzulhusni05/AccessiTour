import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.enums import BookingStatus, ServiceType
from app.models.types import pg_enum


class Booking(Base):
    """One guide booked for one trip segment.

    The service type, dates, times and price are copied from the segment and
    the guide's rates when the booking is made, so later changes to either
    don't alter an existing booking.
    """

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    segment_id: Mapped[int] = mapped_column(
        ForeignKey("trip_segments.id", ondelete="CASCADE"), index=True
    )
    guide_id: Mapped[int] = mapped_column(
        ForeignKey("guides.id", ondelete="CASCADE"), index=True
    )

    service_type: Mapped[ServiceType] = mapped_column(
        pg_enum(ServiceType, "booking_service_type")
    )
    start_date: Mapped[dt.date]
    end_date: Mapped[dt.date]
    start_time: Mapped[dt.time | None]  # MICRO only
    end_time: Mapped[dt.time | None]  # MICRO only
    total_price: Mapped[int] = mapped_column(Integer)

    status: Mapped[BookingStatus] = mapped_column(
        pg_enum(BookingStatus, "booking_status"), default=BookingStatus.REQUESTED
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )