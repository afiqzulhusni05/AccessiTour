from pydantic import BaseModel, Field

from app.enums import Dietary, GenderPreference, Language, MobilityLevel


class EmergencyInfo(BaseModel):
    blood_type: str | None = Field(default=None, max_length=5)
    emergency_contact_name: str | None = Field(default=None, max_length=100)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    medical_notes: str | None = None


class TouristProfileUpdate(BaseModel):
    nationality: str | None = Field(default=None, min_length=2, max_length=2)
    preferred_language: Language
    languages: list[Language] = Field(default_factory=list)
    mobility_level: MobilityLevel = MobilityLevel.NORMAL
    dietary: list[Dietary] = Field(default_factory=list)
    dietary_notes: str | None = None
    gender_preference: GenderPreference = GenderPreference.NO_PREFERENCE
    religious_needs: str | None = None
    special_requests: str | None = None
    emergency: EmergencyInfo = Field(default_factory=EmergencyInfo)


class TouristProfileRead(TouristProfileUpdate):
    id: int
    user_id: int