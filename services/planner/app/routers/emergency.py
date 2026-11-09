"""GET /api/emergency/fields: what the emergency assistant ranks, in one
answer (wingtip.emergency): the fields round the airplane, the wind at its
altitude and its stock profile's glide and landing figures. The ranking is
the engine's best_fields, asked by the app with this."""

from fastapi import APIRouter, Query
from wingtip import emergency
from wingtip.aircraft import OWN_AIRPLANE, load_aircraft_profile, profile_path

from ..emergency.schemas import EmergencyFields
from ..gateway import PUBLIC
from ..plan_query import GlideRatio

router = APIRouter()


def _airplane(name: str | None, glide_ratio: float | None = None) -> dict | None:
    """The stock profile's figures by its bare name, with the pilot's own
    glide ratio over its book's where they set one; for a pilot's own
    airplane of no stock type ("own", wingtip.aircraft.OWN_AIRPLANE) its
    glide ratio alone, and no landing or crosswind figure (none is taken
    from another airplane, the owner 2026-11-09). None for no name, or a
    name that is neither."""
    if name == OWN_AIRPLANE:
        return {"name": name, "type": None, "glide": {"ratio": glide_ratio} if glide_ratio else None}
    if not name or profile_path(name) is None:
        return None
    p = load_aircraft_profile(name)
    glide = p.get("glide")
    if glide_ratio is not None:
        # Its best-glide speed stays the book's: the pilot set the ratio only.
        glide = {**(glide or {}), "ratio": glide_ratio, "source": "The pilot's own figure, from the airplane's handbook"}
    return {
        "name": name,
        "type": p.get("type"),
        "glide": glide,
        "landing": p.get("landing"),
        "crosswind": p.get("crosswind"),
        "cruise_tas_kt": p.get("cruise_tas_kt"),
    }


@router.get("/api/emergency/fields", response_model=EmergencyFields, openapi_extra=PUBLIC)
def emergency_fields(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    altitude_ft: float | None = Query(default=None, ge=-2000, le=60000, description="GPS altitude, ft MSL: the wind there."),
    aircraft: str | None = Query(default=None, max_length=40, description="A stock profile's name (c172), or own."),
    glide_ratio: GlideRatio = None,
    limit: int = Query(default=12, ge=1, le=25),
) -> EmergencyFields:
    """The fields nearest a position with their runways, METARs,
    frequencies and phone; the modelled wind at `altitude_ft`; and the
    airplane's glide and landing figures. Public: an emergency asks no
    sign-in."""
    return EmergencyFields(
        fields=emergency.fields_near(lat, lon, limit),
        wind=emergency.wind_aloft(lat, lon, altitude_ft),
        airplane=_airplane(aircraft, glide_ratio),
    )
