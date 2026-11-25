"""Useful places near a point, for the trip map: public restrooms, and
restaurants and sights to visit (TourAPI). Emergency hospitals are in routers/emergency.py."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import PublicRestroom, User
from app.places import bounding_box, distance_m
from app.schemas.places import RestaurantRead, RestroomRead, SightRead
from app.services.tourapi import TourApiError, fetch_nearby_restaurants, fetch_nearby_sights

router = APIRouter(prefix="/api/v1/places", tags=["places"])


@router.get("/restrooms", response_model=list[RestroomRead])
def nearby_restrooms(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int = Query(default=1000, ge=50, le=5000),
    limit: int = Query(default=10, ge=1, le=50),
    accessible_only: bool = False,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The nearest public restrooms, closest first. With accessible_only, only
    restrooms with a toilet for disabled people."""
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radius_m)
    query = select(PublicRestroom).where(
        PublicRestroom.latitude.between(min_lat, max_lat),
        PublicRestroom.longitude.between(min_lng, max_lng),
    )
    if accessible_only:
        query = query.where(PublicRestroom.accessible_toilets > 0)

    found = []
    for r in db.scalars(query):
        d = distance_m(lat, lng, r.latitude, r.longitude)
        if d <= radius_m:
            found.append((d, r))
    found.sort(key=lambda pair: pair[0])

    return [
        RestroomRead(
            id=r.id, name=r.name, address=r.address, address_en=r.address_en,
            latitude=r.latitude, longitude=r.longitude, distance_m=round(d),
            opening_hours=r.opening_hours, phone=r.phone,
            accessible_toilets=r.accessible_toilets, child_toilets=r.child_toilets,
            has_nursing_room=r.has_nursing_room,
        )
        for d, r in found[:limit]
    ]


@router.get("/restaurants", response_model=list[RestaurantRead])
def nearby_restaurants(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int = Query(default=1000, ge=100, le=5000),
    limit: int = Query(default=10, ge=1, le=30),
    _: User = Depends(get_current_user),
):
    """Restaurants near (lat, lng) from TourAPI, in English, closest first."""
    if not settings.data_go_kr_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Restaurant search is not set up (DATA_GO_KR_KEY missing).",
        )
    try:
        found = fetch_nearby_restaurants(settings.data_go_kr_key, lat, lng, radius_m, limit)
    except TourApiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return [RestaurantRead(**r) for r in found]


@router.get("/sights", response_model=list[SightRead])
def nearby_sights(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int = Query(default=1500, ge=100, le=20000),
    limit: int = Query(default=10, ge=1, le=30),
    _: User = Depends(get_current_user),
):
    """Tourist attractions and cultural sites near (lat, lng) from TourAPI, in English, closest first.
    Used for place suggestions when adding stops to an itinerary."""
    if not settings.data_go_kr_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Place search is not set up (DATA_GO_KR_KEY missing).",
        )
    try:
        found = fetch_nearby_sights(settings.data_go_kr_key, lat, lng, radius_m, limit)
    except TourApiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return [SightRead(**s) for s in found]
