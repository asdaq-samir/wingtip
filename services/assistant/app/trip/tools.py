"""The trip planner's tools (app.trip.agent): the assistant's own (a place,
a field's card, the weather, the plan, the Go / No-Go and the engine's
rules, app.toolbox) and the planner's endpoints a trip needs besides --
the ways to fly a route, the departure window, the fuel stops along it,
the airspace it passes -- and `propose_trip` (app.trip.proposal), which
builds the proposal from the planner's own figures. The model chooses and
words; every figure is the planner's or the engine's.

A time the model gives without an offset is the pilot's own clock
(TripAsk.time_zone): "Saturday 0800" is read here, with the zone, so the
model does no time-zone arithmetic."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from anthropic import beta_tool

from ..generated import planner_client as planner
from ..rule_tools import rule_tools
from ..tool_answers import as_json, failed, pick
from ..toolbox import Context, Toolbox
from . import proposal
from .proposal import NO_PRICES, local_or_utc


class TripToolbox(Toolbox):
    """One trip's tools and what they read: the sources (shown beside the
    proposal), the departure windows asked (by route, for the proposal's
    window) and the proposal itself, the last one proposed."""

    def __init__(self, context: Context | None, time_zone: str) -> None:
        super().__init__(context)
        self.zone = ZoneInfo(time_zone)
        self.windows: dict[tuple[str, str], list] = {}
        self.proposal = None
        self.tools = [
            beta_tool(fn)
            for fn in (
                self.find_place,
                self.airport,
                self.weather_at,
                self.plan_flight,
                self.route_options,
                self.departure_window,
                self.fuel_stops,
                self.airspace_on_route,
                self.go_no_go,
                self.propose_trip,
            )
        ] + rule_tools(self)
        self.by_name = {tool.name: tool for tool in self.tools}

    def depart(self, depart: str | None) -> datetime | None:
        return local_or_utc(depart, self.zone) or self.context.depart

    def local(self, when: datetime | None) -> str | None:
        return None if when is None else when.astimezone(self.zone).strftime("%a %Y-%m-%d %H:%M %Z")

    def route_options(self, dep: str, dest: str, depart: str | None = None) -> str:
        """The ways to fly from one field to another in the airplane: the fastest, the best weather's and over
        land, each with its stops (fuel stops among them), distance, minutes in the air, fuel, and the hazards
        it still crosses (thunderstorms, weather under minimums, TFRs, prohibited areas, high ground).

        Args:
            dep: The departure's ident.
            dest: The destination's ident.
            depart: When it leaves: ISO, the pilot's own clock when no offset is given.
        """
        try:
            found = planner.route_options(
                dep=dep.strip().upper(), dest=dest.strip().upper(), aircraft=self.context.aircraft or None, depart=_utc(self.depart(depart))
            )
        except Exception as err:  # noqa: BLE001 -- the model is told, in the planner's words
            return failed(err)
        names = [h.name for h in found.hazards or []]
        ways = [
            {
                **pick(o, "kind", "title", "stops", "fuel", "distance_nm", "air_min", "fuel_gal", "landings"),
                "crosses": [names[i] for i in o.crosses or [] if i < len(names)],
            }
            for o in found.options or []
        ]
        self.source(
            f"routes:{dep.upper()}-{dest.upper()}",
            f"Route options {dep.upper()} to {dest.upper()}",
            "; ".join(f"{w['title']}: {w['distance_nm']} nm, {w['air_min']} min, stops {','.join(w['stops']) or 'none'}" for w in ways)[
                :2000
            ],
        )
        return as_json({"options": ways, "unchecked": found.unchecked})

    def departure_window(self, dep: str, dest: str, stops: str = "", start: str | None = None, hours: int = 12) -> str:
        """When to go: the Go / No-Go for each departure hour the forecasts reach (go, caution, no-go), and the
        runs of go hours, best first. Ask it before choosing a departure time.

        Args:
            dep: The departure's ident.
            dest: The destination's ident.
            stops: Stops on the way, comma-separated idents.
            start: The first hour to look at: ISO, the pilot's own clock when no offset is given; the next hour when empty.
            hours: How many hours to look at, 1 to 48.
        """
        c = self.context
        body = {
            "dep": dep.strip().upper(),
            "dest": dest.strip().upper(),
            "stops": stops,
            "aircraft": c.aircraft or None,
            "airplane": bool(c.aircraft),
            "rules": c.rules,
            "start": _utc(self.depart(start)),
            "hours": max(1, min(48, int(hours))),
        }
        try:
            found = planner.departure_window(body={k: v for k, v in body.items() if v not in (None, "")})
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.windows[(body["dep"], body["dest"])] = list(found.windows or [])
        windows = [
            {"start": self.local(w.start), "last": self.local(w.last), "hours": w.hours, "ete_min": w.ete_min} for w in found.windows or []
        ]
        self.source(
            f"window:{body['dep']}-{body['dest']}",
            f"Departure window {body['dep']} to {body['dest']}",
            "; ".join(f"{w['start']} to {w['last']}" for w in windows) or "No go hours in the forecasts' reach.",
        )
        hours_said = [
            {"depart": self.local(h.depart), "verdict": h.verdict, "why": [r.label for r in h.reasons or []][:2]} for h in found.hours or []
        ]
        return as_json({"windows": windows, "hours": hours_said, "forecast_until": self.local(found.forecast_until)})

    def fuel_stops(self, dep: str, dest: str, stops: str = "") -> str:
        """The fields along a route that sell fuel: the fuel each sells, how far along the route it is and the
        miles it adds. The app has no fuel prices.

        Args:
            dep: The departure's ident.
            dest: The destination's ident.
            stops: Stops on the way, comma-separated idents.
        """
        try:
            found = planner.stops_along(dep=dep.strip().upper(), dest=dest.strip().upper(), stops=stops or None)
        except Exception as err:  # noqa: BLE001
            return failed(err)
        fields = [pick(f, "ident", "name", "fuel_types", "distance_nm", "added_nm", "off_nm") for f in found.fields or [] if f.fuel_types]
        self.source(
            f"fuel:{dep.upper()}-{dest.upper()}",
            f"Fuel along {dep.upper()} to {dest.upper()}",
            "; ".join(f"{f['ident']} {'/'.join(f['fuel_types'])}" for f in fields)[:2000] or "None found.",
        )
        return as_json({"fields": fields, "prices": None, "prices_note": NO_PRICES})

    def airspace_on_route(self, dep: str, dest: str, stops: str = "") -> str:
        """The Class B, C and D airspace a route passes through (floor and ceiling, where along it), and where it
        enters a Class B, the waypoints that would keep it out (best first).

        Args:
            dep: The departure's ident.
            dest: The destination's ident.
            stops: Stops on the way, comma-separated idents.
        """
        try:
            found = proposal.airspace(dep.strip().upper(), dest.strip().upper(), stops, self.context.aircraft)
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.source(
            f"airspace:{dep.upper()}-{dest.upper()}",
            f"Airspace {dep.upper()} to {dest.upper()}",
            "; ".join(found["passes"]) or "No Class B, C or D on the route.",
        )
        return as_json(found)

    def propose_trip(
        self,
        dep: str,
        dest: str,
        depart: str,
        stops: str = "",
        altitude_ft: float | None = None,
        return_depart: str | None = None,
        return_stops: str = "",
        return_altitude_ft: float | None = None,
        back_by: str | None = None,
        avoid_class_b: bool = False,
        max_fuel_price: float | None = None,
        why: str = "",
        unmet: list[str] | None = None,
    ) -> str:
        """Propose the trip to the pilot: the route, its stops, altitude and departure, and the return where the
        pilot asked for one. The planner plans each leg and gives its figures and checks the constraints; the
        pilot reviews it and taps Use, and nothing changes until then. Call it once the trip is worked out; call it
        again to replace it. It answers with each leg's figures and any constraint not met: say those plainly.

        Args:
            dep: The departure's ident.
            dest: The destination's ident.
            depart: When to leave: ISO, the pilot's own clock when no offset is given.
            stops: Stops on the way, comma-separated idents (fuel stops among them).
            altitude_ft: A cruise altitude; the planner's choice when omitted.
            return_depart: When the return leaves, where the pilot asked for one: ISO, the pilot's own clock.
            return_stops: The return's stops, comma-separated idents.
            return_altitude_ft: The return's cruise altitude; the planner's choice when omitted.
            back_by: When the pilot must be back, where they said: ISO, the pilot's own clock.
            avoid_class_b: The pilot asked to stay out of Class B airspace.
            max_fuel_price: A fuel price limit the pilot gave, dollars a gallon.
            why: Why this plan, in one or two short sentences, with no figure of your own.
            unmet: Each constraint of the pilot's you could not meet, in a short sentence.
        """
        try:
            made = proposal.build(
                self,
                dep,
                dest,
                depart,
                stops,
                altitude_ft,
                return_depart,
                return_stops,
                return_altitude_ft,
                back_by,
                avoid_class_b,
                max_fuel_price,
                why,
                unmet or [],
            )
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.proposal = made
        return as_json(made.model_dump(exclude={"rationale"}))


def _utc(when: datetime | None) -> str | None:
    return None if when is None else when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
