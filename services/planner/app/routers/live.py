"""What the FAA's SWIM feeds say now, as ingest kept it (services/ingest,
wingtip.live_reports): the ITWS alerts at an airport, and the status of
special activity airspace. Each answers from the store at once; nothing
here fetches, and nothing judges a figure (the Go / No-Go's findings are
the engine's)."""
import time

from fastapi import APIRouter, Query
from wingtip import itws, saa

from ..schemas import ItwsAlerts, SaaStatuses

router = APIRouter()


def _list(text: str) -> list[str]:
    """A comma-separated query value as its items: "KORD, KMDW" is two."""
    return [item.strip() for item in text.split(",") if item.strip()][:40]


@router.get("/api/live/itws", response_model=ItwsAlerts)
def itws_alerts(airports: str = Query(min_length=3, description="Airports, comma separated: KORD,KMDW")) -> ItwsAlerts:
    """The ITWS alerts in force at these airports (a route's departure,
    destination and alternates): microbursts, wind shear, gust fronts,
    tornadoes and storm cells near the field, as the tower's ITWS gives
    them its controllers (AIM 4-3-7)."""
    return ItwsAlerts(alerts=itws.at_airports(_list(airports)))


@router.get("/api/live/saa", response_model=SaaStatuses)
def saa_status(designators: str = Query(min_length=1, description="Areas, comma separated: R-4401A,R-4401B")) -> SaaStatuses:
    """Whether each special activity airspace is active now, and until
    when, as SFDPS has it (wingtip.saa); an area it has not spoken of is
    left out, its chart times of use being all there is."""
    return SaaStatuses(areas=saa.status(_list(designators), now=time.time()))
