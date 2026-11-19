from pydantic import BaseModel


class HospitalRead(BaseModel):
    hpid: str | None
    name: str
    kind: str | None  # e.g. 종합병원 (general hospital)
    address: str | None
    phone: str | None
    latitude: float
    longitude: float
    distance_m: int | None


class EmergencyHospitalsResponse(BaseModel):
    # Always shown, even when the hospital list is empty or the service is slow.
    emergency_number: str = "119"
    tourist_helpline: str = "1330"  # Korea Travel Hotline, 24h, English/Malay/etc.
    hospitals: list[HospitalRead]
