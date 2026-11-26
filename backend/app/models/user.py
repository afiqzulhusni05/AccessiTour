import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserRole(str, enum.Enum):
    TOURIST = "TOURIST"
    GUIDE = "GUIDE"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # When the profile photo last changed; null = no photo. The image itself is in user_photos.
    photo_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def photo_url(self) -> str | None:
        """Path of the photo, relative to the API root, with a version so browsers refetch after a change."""
        if self.photo_updated_at is None:
            return None
        return f"/users/{self.id}/photo?v={int(self.photo_updated_at.timestamp())}"