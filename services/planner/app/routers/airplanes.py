"""A US airplane's public record by its N-number, for its card: the FAA
registry's, the NTSB's and where it is usually based
(wingtip.aircraft_details), and its photo apart (wingtip.aircraft_photo),
so the record never waits on Planespotters.net."""

from fastapi import APIRouter, HTTPException, Path
from wingtip import aircraft_details, aircraft_photo, registry

from ..gateway import PUBLIC
from ..schemas.airplane import AirplaneDetails, AirplanePhoto

router = APIRouter()

N_NUMBER = Path(min_length=2, max_length=7, description="An N-number: N654FL, 654FL or N-654FL")


@router.get("/api/airplanes/{n_number}", response_model=AirplaneDetails, openapi_extra=PUBLIC)
def airplane(n_number: str = N_NUMBER) -> AirplaneDetails:
    """Everything public about a US airplane: its FAA registration in full,
    its make and model's and its engine's reference records, its past
    registrations, the documents filed against it, the N-number's
    reservation, its NTSB accidents and incidents, and where it is usually
    based (`based_pending` while that is looked up: ask again). A 422 for
    what is not an N-number."""
    found = aircraft_details.details(n_number)
    if found is None:
        raise HTTPException(422, "Not an N-number: a US registration is N, a digit 1-9, then up to four digits or letters.")
    return AirplaneDetails(**found)


@router.get("/api/airplanes/{n_number}/photo", response_model=AirplanePhoto | None, openapi_extra=PUBLIC)
def airplane_photo(n_number: str = N_NUMBER) -> AirplanePhoto | None:
    """The newest photo of this very airplane on Planespotters.net, with its
    photographer and its page, to be shown on their terms (AirplanePhoto);
    null where it has none or it cannot be asked now."""
    n = aircraft_details.n_number(n_number)
    if n is None:
        raise HTTPException(422, "Not an N-number: a US registration is N, a digit 1-9, then up to four digits or letters.")
    reg = registry.lookup(n_number=n) or {}
    found = aircraft_photo.photo(reg.get("mode_s_hex"), n)
    return AirplanePhoto(**found) if found else None
