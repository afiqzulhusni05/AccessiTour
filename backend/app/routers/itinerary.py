from fastapi import APIRouter, HTTPException

from app.schemas.itinerary import ItineraryGenerateRequest
from app.services.ai_itinerary import ItineraryStop, generate_itinerary


router = APIRouter(
    prefix="/api/v1/itinerary",
    tags=["itinerary"],
)


@router.post("/generate", response_model=list[ItineraryStop])
def generate_itinerary_endpoint(data: ItineraryGenerateRequest):
    try:
        return generate_itinerary(
            region=data.region,
            start_date=data.start_date,
            end_date=data.end_date,
            service_type=data.service_type,
            start_time=data.start_time,
            end_time=data.end_time,
            group_size=data.group_size,
            transport_preference=data.transport_preference,
            attributes=data.attributes,
            budget=data.budget,
            preferred_language=data.preferred_language,
            mobility_level=data.mobility_level,
            dietary=data.dietary,
            dietary_notes=data.dietary_notes,
            special_requests=data.special_requests,
            guide_languages=data.guide_languages,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except RuntimeError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error),
        ) from error