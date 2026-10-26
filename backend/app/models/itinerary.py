import datetime as dt

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.enums import EditedBy
from app.models.types import pg_enum


class Itinerary(Base):
    """The plan for one booking. The AI writes the first draft, then the
    tourist and guide edit it and both approve it."""

    __tablename__ = "itineraries"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), unique=True
    )
    needs_accessibility_check: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by_tourist: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by_guide: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ItineraryItem(Base):
    """One stop in an itinerary."""

    __tablename__ = "itinerary_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    itinerary_id: Mapped[int] = mapped_column(
        ForeignKey("itineraries.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt.date]
    start_time: Mapped[dt.time]
    end_time: Mapped[dt.time]
    place_name: Mapped[str] = mapped_column(String(200))
    activity: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    edited_by: Mapped[EditedBy] = mapped_column(
        pg_enum(EditedBy, "edited_by"), default=EditedBy.AI
    )
    # Used while travelling and by the app's stop list. Plain strings, checked in schemas/itineraries.py.
    progress: Mapped[str] = mapped_column(String(20), default="UPCOMING", server_default="UPCOMING")
    transport: Mapped[str | None] = mapped_column(String(20))  # how the tourist gets to this stop
    meal: Mapped[str | None] = mapped_column(String(10))  # LUNCH or DINNER when the stop is a restaurant
    needs_accessibility_check: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class ItineraryComment(Base):
    """A comment from the tourist or guide, on the whole itinerary or one stop."""

    __tablename__ = "itinerary_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    itinerary_id: Mapped[int] = mapped_column(
        ForeignKey("itineraries.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("itinerary_items.id", ondelete="SET NULL")
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )