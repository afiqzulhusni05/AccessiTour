"""Emergency help near the tourist: the closest emergency hospitals.

No login needed: in an emergency nobody should have to sign in first.
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.config import settings
from app.schemas.emergency import EmergencyHospitalsResponse, HospitalRead
from app.services.emergency import EmergencyServiceError, fetch_nearby_hospitals

router = APIRouter(prefix="/api/v1/emergency", tags=["emergency"])


@router.get("/hospitals", response_model=EmergencyHospitalsResponse)
def nearby_emergency_hospitals(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    limit: int = Query(default=5, ge=1, le=20),
):
    """The emergency hospitals closest to (lat, lng), closest first,
    plus the numbers to call (119, and 1330 for tourists)."""
    if not settings.data_go_kr_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Emergency hospital search is not set up (DATA_GO_KR_KEY missing). Call 119.",
        )
    try:
        found = fetch_nearby_hospitals(settings.data_go_kr_key, lat, lng, limit)
    except EmergencyServiceError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"{exc}. In an emergency, call 119."
        ) from exc
    return EmergencyHospitalsResponse(hospitals=[HospitalRead(**h) for h in found])
