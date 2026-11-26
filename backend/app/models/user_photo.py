from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserPhoto(Base):
    """A user's profile photo: a 512×512 JPEG with no EXIF data, about 20–60 KB.

    Kept in its own table so loading users never loads image bytes. Kept in the
    database (not on disk) because Render's disk is wiped on every deploy.
    """

    __tablename__ = "user_photos"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[bytes] = mapped_column(LargeBinary)
    content_type: Mapped[str] = mapped_column(String(50))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
