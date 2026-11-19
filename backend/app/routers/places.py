"""Useful places near a point, for the trip map: public restrooms for now
(emergency hospitals and TourAPI restaurants will follow)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import PublicRestroom, User
from app.places import bounding_box, distance_m
from app.schemas.places import RestroomRead

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
