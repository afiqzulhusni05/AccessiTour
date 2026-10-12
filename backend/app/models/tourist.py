from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.enums import GenderPreference, Language, MobilityLevel
from app.models.types import pg_enum, str_list


class Tourist(Base):
    __tablename__ = "tourists"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    nationality: Mapped[str | None] = mapped_column(String(2))
    preferred_language: Mapped[Language] = mapped_column(
        pg_enum(Language, "language_code")
    )
    languages: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    mobility_level: Mapped[MobilityLevel] = mapped_column(
        pg_enum(MobilityLevel, "mobility_level"), default=MobilityLevel.NORMAL
    )
    dietary: Mapped[list[str]] = mapped_column(
        str_list(), default=list, server_default="{}"
    )
    dietary_notes: Mapped[str | None] = mapped_column(Text)
    gender_preference: Mapped[GenderPreference] = mapped_column(
        pg_enum(GenderPreference, "gender_preference"),
        default=GenderPreference.NO_PREFERENCE,
    )
    religious_needs: Mapped[str | None] = mapped_column(Text)
    special_requests: Mapped[str | None] = mapped_column(Text)

    # Private: only the tourist can see these, never guides or the AI
    blood_type: Mapped[str | None] = mapped_column(String(5))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(100))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30))
    medical_notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )