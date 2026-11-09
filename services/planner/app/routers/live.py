"""What the FAA's SWIM feeds say now, as ingest kept it (services/ingest,
wingtip.live_reports): ITWS's alerts at an airport, special activity
airspace status, each runway's RVR, the D-ATIS, the Command Center's
programs and restrictions, and a flight's tower departure events. Each
answers from the store at once; nothing here fetches, and nothing judges
a figure (what RVR means against a minimum, or a program for a flight,
is the engine's: rvr_check, the Go / No-Go)."""
import time

from fastapi import APIRouter, Query
from wingtip import datis, departures, flow, itws, rvr, saa

from ..schemas import AirportAtis, AirportRvr, DepartureEvents, FlowAtAirports, ItwsAlerts, SaaStatuses
from ..gateway import PUBLIC

router = APIRouter()


def _list(text: str) -> list[str]:
    """A comma-separated query value as its items: "KORD, KMDW" is two."""
    return [item.strip() for item in text.split(",") if item.strip()][:40]


@router.get("/api/live/itws", response_model=ItwsAlerts, openapi_extra=PUBLIC)
def itws_alerts(airports: str = Query(min_length=3, description="Airports, comma separated: KORD,KMDW")) -> ItwsAlerts:
    """The ITWS alerts in force at these airports (a route's departure,
    destination and alternates): microbursts, wind shear, gust fronts,
    tornadoes and storm cells near the field, as the tower's ITWS gives
    them its controllers (AIM 4-3-7)."""
    return ItwsAlerts(alerts=itws.at_airports(_list(airports)))


@router.get("/api/live/saa", response_model=SaaStatuses, openapi_extra=PUBLIC)
def saa_status(designators: str = Query(min_length=1, description="Areas, comma separated: R-4401A,R-4401B")) -> SaaStatuses:
    """Whether each special activity airspace is active now, and until
    when, as SFDPS has it (wingtip.saa); an area it has not spoken of is
    left out, its chart times of use being all there is."""
    return SaaStatuses(areas=saa.status(_list(designators), now=time.time()))


@router.get("/api/live/rvr", response_model=AirportRvr, openapi_extra=PUBLIC)
def runway_rvr(airport: str = Query(min_length=3, max_length=4)) -> AirportRvr:
    """An airport's runway visual range, runway end by runway end, as its
    RVR system reports it now (wingtip.rvr)."""
    return AirportRvr(airport=airport.upper(), runways=rvr.at_airport(airport))


@router.get("/api/live/atis", response_model=AirportAtis, openapi_extra=PUBLIC)
def digital_atis(airport: str = Query(min_length=3, max_length=4)) -> AirportAtis:
    """An airport's D-ATIS as the tower's data link sends it, with the
    engine's reading of it (wingtip.datis)."""
    return AirportAtis(airport=airport.upper(), broadcasts=datis.at_airport(airport))


@router.get("/api/live/flow", response_model=FlowAtAirports, openapi_extra=PUBLIC)
def flow_programs(airports: str = Query(min_length=3, description="Airports, comma separated: KEWR,KLGA")) -> FlowAtAirports:
    """The ground stops, ground delay programs and restrictions in force
    or to come at these airports, from the Command Center's advisories
    and TFMS's restrictions (wingtip.flow)."""
    return FlowAtAirports(programs=flow.at_airports(_list(airports)))


@router.get("/api/live/departures", response_model=DepartureEvents, openapi_extra=PUBLIC)
def departure_events(ident: str = Query(min_length=2, max_length=10, description="A registration or call sign")) -> DepartureEvents:
    """A flight's tower departure events by its ident, latest first
    (wingtip.departures): when its departure clearance was delivered, from
    which gate, to where."""
    return DepartureEvents(events=departures.of(ident))
