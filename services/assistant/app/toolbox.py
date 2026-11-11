"""The assistant's tools for one answer: the planner's own endpoints
(the plan, the weather at a field, the briefing, the Go / No-Go, a
field's card, the nearest fields, a place, a diversion, a proposed
change), asked through the client generated from the planner's OpenAPI
document (app.generated.planner_client), and the engine's rules a pilot
asks about (app.rule_tools), generated from the engine's contract.

Each tool records what it read as a source -- a METAR as sent, a
finding's line, a plan's totals -- for the screen to show beside the
answer. Every field read is read by the planner's own name on its own
model, so a field the planner renames fails here and in the tests, not
as a quiet None in front of a pilot."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from anthropic import beta_tool
from pydantic import BaseModel, Field

from .generated import planner_client as planner
from .rule_tools import rule_tools
from .tool_answers import as_json, failed, pick


class OwnShip(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    altitude_ft: float | None = None
    track_deg: float | None = None
    groundspeed_kt: float | None = None


class Context(BaseModel):
    """The pilot's plan, position and record as the app has them."""

    dep: str = ""
    dest: str = ""
    stops: list[str] = []
    aircraft: str = ""
    altitude_ft: float | None = None
    depart: datetime | None = None
    rules: Literal["vfr", "ifr"] = "vfr"
    own_ship: OwnShip | None = None
    #: Personal minimums, currency, the home base: free-form, as the app
    #: keeps them; written into the question for the model to compare
    #: the figures against.
    pilot: dict | None = None


class Source(BaseModel):
    """A raw thing a sentence can rest on, shown to the pilot as sent."""

    id: str
    label: str
    text: str


def _stops(stops: str | list[str] | None) -> str:
    if not stops:
        return ""
    if isinstance(stops, str):
        return stops
    return ",".join(s.strip().upper() for s in stops if s.strip())


def _iso(when: datetime | None) -> str | None:
    """A time as the planner's query reads it, UTC."""
    return None if when is None else when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ident(ident: str) -> str:
    """An ident as a path segment: letters and digits only, so a model's
    stray slash cannot reach another planner path."""
    return "".join(ch for ch in ident.strip().upper() if ch.isalnum()) or "-"


def _zulu(observed: object) -> str:
    """ "1753Z" from an ISO time, or nothing."""
    if not observed:
        return ""
    try:
        when = observed if isinstance(observed, datetime) else datetime.fromisoformat(str(observed).replace("Z", "+00:00"))
        return when.astimezone(timezone.utc).strftime("%H%MZ")
    except ValueError:
        return ""


#: The fields of each answer the model is given, by the models' own names.
LEG_FIELDS = ("from_", "to", "distance_nm", "magnetic_heading_deg", "groundspeed_kt", "ete_min", "fuel_gal", "altitude_ft", "wind")
TFR_FIELDS = (
    "notam_id",
    "title",
    "kind",
    "purpose",
    "floor_ft",
    "floor_ref",
    "ceiling_ft",
    "ceiling_ref",
    "effective",
    "expires",
    "active_now",
    "crosses",
    "on_route",
)
HAZARD_FIELDS = ("type", "hazard", "altitude_low_ft", "altitude_high_ft", "on_route")
ITEM_FIELDS = ("key", "label", "finding", "detail")
RISK_FIELDS = ("score", "level", "line", "words", "factors")
AIRPORT_FIELDS = (
    "ident",
    "name",
    "municipality",
    "region",
    "elevation_ft",
    "kind",
    "airspace_class",
    "towered",
    "private",
    "military",
    "lighting",
    "radio_notes",
    "pattern",
    "runways",
    "frequencies",
)


def _tfr_line(tfr) -> str:
    """A TFR as its source reads: what it is, its band and its hours."""

    def level(ft, ref) -> str:
        return "" if ft is None else f"{ft:g} ft {ref or ''}".strip()

    band = " to ".join(x for x in (level(tfr.floor_ft, tfr.floor_ref), level(tfr.ceiling_ft, tfr.ceiling_ref)) if x)
    hours = " to ".join(x for x in (tfr.effective, tfr.expires) if x)
    parts = (tfr.title or tfr.purpose, tfr.kind, band, hours)
    return "; ".join(str(p) for p in parts if p) or as_json(tfr)


class Toolbox:
    """The tools of one answer, made for the request: the SDK wants plain
    functions, and the answer runs in a thread pool a call at a time
    (StreamingResponse), so what a tool reads is kept on this object
    rather than in a thread's or a context's variable. `sources` fills as
    the tools are asked, `actions` with the changes proposed; `context` is
    the plan's own fields, given to the tools where the pilot's question
    leaves them out ("what's the weather there?")."""

    def __init__(self, context: Context | None = None) -> None:
        self.context = context or Context()
        self.sources: list[Source] = []
        #: The changes to the plan proposed, each {"change": {...}, "words": ...}.
        self.actions: list[dict] = []
        self.tools = [
            beta_tool(fn)
            for fn in (
                self.plan_flight,
                self.weather_at,
                self.briefing_for,
                self.go_no_go,
                self.airport,
                self.nearest_airports,
                self.find_place,
                self.divert,
                self.propose_change,
            )
        ] + rule_tools(self)
        self.by_name = {tool.name: tool for tool in self.tools}

    def source(self, id: str, label: str, text: str) -> None:
        if all(s.id != id for s in self.sources):
            self.sources.append(Source(id=id, label=label, text=text))

    def route(self, dep: str, dest: str, stops: str) -> tuple[str, str, str]:
        """The route asked, the plan's where the question left a field out."""
        c = self.context
        return (dep or c.dep).strip().upper(), (dest or c.dest).strip().upper(), _stops(stops) or _stops(c.stops)

    def depart(self, depart: str | None) -> datetime | None:
        if depart:
            when = datetime.fromisoformat(depart.replace("Z", "+00:00"))
            return when if when.tzinfo else when.replace(tzinfo=timezone.utc)
        return self.context.depart

    def plan_flight(
        self,
        dep: str = "",
        dest: str = "",
        stops: str = "",
        aircraft: str = "",
        altitude_ft: float | None = None,
        depart: str | None = None,
        rules: str = "",
    ) -> str:
        """Plan the flight as the nav log does: the cruise altitude chosen and why, each leg's distance,
        magnetic heading, groundspeed, time and fuel, the totals, and the cautions. Ask this before any question
        about time, distance, fuel, altitude or arrival.

        Args:
            dep: The departure airport's ident (C81, KDLH); the pilot's plan's when empty.
            dest: The destination's ident; the plan's when empty.
            stops: Stops on the way, comma-separated idents; the plan's when empty.
            aircraft: The airplane's profile name (c172, pa28140); the plan's when empty.
            altitude_ft: A cruise altitude to plan at; the planner's choice when omitted.
            depart: The departure time, ISO 8601 UTC; the plan's, else now.
            rules: "vfr" or "ifr"; the plan's when empty.
        """
        try:
            c = self.context
            dep, dest, stops = self.route(dep, dest, stops)
            planned = planner.plan(
                dep=dep,
                dest=dest,
                stops=stops,
                aircraft=aircraft or c.aircraft,
                altitude_ft=altitude_ft if altitude_ft is not None else c.altitude_ft,
                depart=_iso(self.depart(depart)),
                rules=rules or c.rules,
            )  # type: ignore[arg-type]
        except Exception as err:  # noqa: BLE001 -- the model is told, in the planner's words
            return failed(err)
        totals = planned.totals
        answer = {
            "route": f"{dep} {stops} {dest}".replace("  ", " "),
            "altitude_ft": planned.altitude_ft,
            "flown": planned.altitude_choice or "custom",
            "cautions": planned.altitude_cautions,
            "legs": [pick(leg, *LEG_FIELDS) for leg in planned.legs or []],
            "totals": pick(totals, "distance_nm", "ete_min", "fuel_gal") if totals else {},
        }
        label = f"The plan {dep} to {dest}" + (f" via {stops}" if stops else "")
        line = (
            f"{label}: {totals and totals.distance_nm} nm, {totals and totals.ete_min} min, "
            f"{totals and totals.fuel_gal} gal at {planned.altitude_ft} ft"
        )
        self.source(f"plan:{dep}-{dest}", label, line)
        return as_json(answer)

    def weather_at(self, ident: str) -> str:
        """The weather at a field now: its METAR as sent and read (flight category, ceiling, visibility, wind,
        altimeter, temperature), the nearest report where the field has none, and its elevation.

        Args:
            ident: The airport's ident (KDLH, C81).
        """
        try:
            place = planner.airport_place(ident=_ident(ident))
        except Exception as err:  # noqa: BLE001
            return failed(err)
        metar, nearby = place.metar, place.nearby_metar
        if metar and metar.raw:
            self.source(f"metar:{place.ident}", f"METAR {place.ident} {_zulu(metar.observed_at)}".strip(), metar.raw)
        elif nearby and nearby.metar and nearby.metar.raw:
            near = nearby.metar
            self.source(f"metar:{nearby.ident}", f"METAR {nearby.ident} {_zulu(near.observed_at)} (nearest)".replace("  ", " "), near.raw)
        if place.taf:
            self.source(f"taf:{place.ident}", f"TAF {place.ident}", place.taf)
        return as_json(pick(place, "ident", "name", "elevation_ft", "metar", "nearby_metar", "taf", "weather_unavailable"))

    def briefing_for(self, dep: str = "", dest: str = "", stops: str = "", depart: str | None = None, ete_min: float | None = None) -> str:
        """The flight's briefing for its hours: the hazards (SIGMETs, AIRMETs, G-AIRMETs) and where the route
        meets them, the TFRs, the fields below VFR, "VFR flight not recommended", each field's METAR, and the
        forecast at each field. Ask this for any question about weather along the route or at arrival.

        Args:
            dep: The departure's ident; the plan's when empty.
            dest: The destination's ident; the plan's when empty.
            stops: Stops, comma-separated; the plan's when empty.
            depart: The departure time, ISO 8601 UTC; the plan's, else now.
            ete_min: The flight's time in minutes, for the hours briefed; two hours when omitted.
        """
        try:
            dep, dest, stops = self.route(dep, dest, stops)
            brief = planner.briefing(dep=dep, dest=dest, stops=stops, depart=_iso(self.depart(depart)), ete_min=ete_min)
        except Exception as err:  # noqa: BLE001
            return failed(err)
        for ident, metar in (brief.metars or {}).items():
            if metar and metar.raw:
                self.source(f"metar:{ident}", f"METAR {ident} {_zulu(metar.observed_at)}".strip(), metar.raw)
        for n, h in enumerate(brief.hazards or [], 1):
            text = h.raw or h.hazard or ""
            if text:
                self.source(f"hazard:{n}", f"{h.type or 'Hazard'} {h.hazard or ''}".strip(), text)
        for n, t in enumerate(brief.tfrs or [], 1):
            # The briefing's TFR carries no NOTAM text, only the fields
            # read from it: the source is those, in a line.
            self.source(f"tfr:{n}", f"TFR {t.notam_id or n}", _tfr_line(t)[:2000])
        answer = {
            "route": f"{dep} {stops} {dest}".replace("  ", " "),
            "hazards": [pick(h, *HAZARD_FIELDS) for h in brief.hazards or []],
            "tfrs": [pick(t, *TFR_FIELDS) for t in brief.tfrs or []],
            **pick(brief, "fields_below_vfr", "vfr_not_recommended", "metars", "forecast", "weather_unavailable"),
        }
        return as_json(answer)

    def go_no_go(
        self,
        dep: str = "",
        dest: str = "",
        stops: str = "",
        aircraft: str = "",
        altitude_ft: float | None = None,
        depart: str | None = None,
        rules: str = "",
    ) -> str:
        """The Go / No-Go verdict for the flight: the line over the findings, each finding (the weather, the
        TFRs, the altitude, the fuel, the runways, the weight and balance, the risk) with its words, and the risk
        assessment's score, level and factors. The pilot's personal minimums in the context are applied.

        Args:
            dep: The departure's ident; the plan's when empty.
            dest: The destination's ident; the plan's when empty.
            stops: Stops, comma-separated; the plan's when empty.
            aircraft: The airplane's profile name; the plan's when empty.
            altitude_ft: A cruise altitude; the planner's choice when omitted.
            depart: The departure time, ISO 8601 UTC; the plan's, else now.
            rules: "vfr" or "ifr"; the plan's when empty.
        """
        try:
            c = self.context
            dep, dest, stops = self.route(dep, dest, stops)
            fields: dict = {
                "dep": dep,
                "dest": dest,
                "stops": stops,
                "aircraft": aircraft or c.aircraft or None,
                "altitude_ft": altitude_ft if altitude_ft is not None else c.altitude_ft,
                "depart": _iso(self.depart(depart)),
                "rules": rules or c.rules,
            }
            pilot = c.pilot or {}
            # The pilot's own minimums, loading, ticks and currency as the
            # app keeps them, taken only in the ask's own shapes: the apps
            # also send currency as lines of words for the model to read,
            # which the verdict cannot take.
            for key in ("minimums", "load", "currency", "own_airplane"):
                if isinstance(pilot.get(key), dict):
                    fields[key] = pilot[key]
            if isinstance(pilot.get("ticked"), list) and all(isinstance(t, str) for t in pilot["ticked"]):
                fields["ticked"] = pilot["ticked"]
            if isinstance(pilot.get("personal_minimums"), dict) and "minimums" not in fields:
                fields["minimums"] = pilot["personal_minimums"]
            verdict = planner.go_no_go(body={k: v for k, v in fields.items() if v is not None})
        except Exception as err:  # noqa: BLE001
            return failed(err)
        line = verdict.line
        self.source("verdict", f"Go / No-Go {dep} to {dest}", f"{line and line.finding or ''}: {line and line.words or ''}")
        for item in verdict.items or []:
            key = item.key or item.label
            self.source(f"finding:{key}", f"{item.label}: {item.finding}", item.detail or "")
        risk = verdict.risk
        if risk:
            self.source("risk", "Risk assessment", f"{risk.line or ''} {risk.words or ''}".strip())
        answer = {
            "line": line,
            "items": [pick(item, *ITEM_FIELDS) for item in verdict.items or []],
            "risk": pick(risk, *RISK_FIELDS) if risk else None,
            "balance_problems": verdict.balance.problems if verdict.balance else None,
        }
        return as_json(answer)

    def airport(self, ident: str) -> str:
        """A field's card: its name, elevation, the class of airspace over it, whether it is towered, its
        runways (length, width, surface), its frequencies, its traffic pattern and lighting.

        Args:
            ident: The airport's ident (KDLH, C81).
        """
        try:
            place = planner.airport_place(ident=_ident(ident))
        except Exception as err:  # noqa: BLE001
            return failed(err)
        runways = ", ".join(f"{r.ends or ''} {r.length_ft or ''} ft".strip() for r in place.runways or [])
        self.source(
            f"airport:{place.ident}",
            f"{place.ident} {place.name or ''}".strip(),
            f"Elevation {place.elevation_ft} ft; Class {place.airspace_class or 'G'}; runways {runways}",
        )
        return as_json(pick(place, *AIRPORT_FIELDS))

    def nearest_airports(self, lat: float | None = None, lon: float | None = None, limit: int = 5) -> str:
        """The landing fields nearest a position, with distance and bearing: the airplane's own position when
        none is given.

        Args:
            lat: Latitude, degrees; the airplane's when omitted.
            lon: Longitude, degrees; the airplane's when omitted.
            limit: How many, 1 to 25.
        """
        own = self.context.own_ship
        if (lat is None or lon is None) and own is None:
            return "Error: no position: the airplane's position is not known and none was given."
        try:
            found = planner.nearest_airports(
                lat=lat if lat is not None else own.lat,  # type: ignore[union-attr]
                lon=lon if lon is not None else own.lon,  # type: ignore[union-attr]
                limit=max(1, min(25, int(limit))),
            )
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.source("nearest", "Nearest airports", as_json(found)[:2000])
        return as_json(found)

    def find_place(self, text: str) -> str:
        """Where a place the pilot named is: the airports whose ident or name starts with the text, and the towns.

        Args:
            text: What the pilot said: an ident, an airport's name, a town.
        """
        try:
            return as_json(planner.places_search(q=text))
        except Exception as err:  # noqa: BLE001
            return failed(err)

    def divert(
        self, to: str, lat: float | None = None, lon: float | None = None, altitude_ft: float | None = None, aircraft: str = ""
    ) -> str:
        """A diversion from a point to a field: the heading, distance, time and fuel to it, as the diversion
        drill works them. The airplane's own position and the plan's altitude and airplane when none are given.

        Args:
            to: The field to divert to, by ident.
            lat: Latitude of the point diverting from; the airplane's when omitted.
            lon: Longitude of the point; the airplane's when omitted.
            altitude_ft: The altitude to fly it at; the plan's, else 3,000.
            aircraft: The airplane's profile name; the plan's when empty.
        """
        c = self.context
        own = c.own_ship
        if (lat is None or lon is None) and own is None:
            return "Error: no position: the airplane's position is not known and none was given."
        try:
            answer = planner.diversion(
                lat=lat if lat is not None else own.lat,  # type: ignore[union-attr]
                lon=lon if lon is not None else own.lon,  # type: ignore[union-attr]
                to=to.strip().upper(),
                altitude_ft=altitude_ft or c.altitude_ft or 3000.0,
                aircraft=aircraft or c.aircraft,
            )
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.source(f"diversion:{to.upper()}", f"Diversion to {to.upper()}", as_json(answer)[:1500])
        return as_json(answer)

    def propose_change(
        self,
        dep: str = "",
        dest: str = "",
        stops: str | None = None,
        altitude_ft: float | None = None,
        depart: str | None = None,
        why: str = "",
    ) -> str:
        """Propose a change to the pilot's plan -- the departure, the destination, the stops, the cruise altitude,
        the departure time -- for the pilot to confirm in the app; nothing changes until they do. Give only the
        fields that change. This computes nothing: ask plan_flight with the same fields for the changed plan's
        figures.

        Args:
            dep: A different departure, by ident.
            dest: A different destination, by ident.
            stops: Every stop the route would then make, in order, comma-separated idents: the plan's stops with one
                added or taken out. "" for none.
            altitude_ft: A different cruise altitude, feet.
            depart: A different departure time, ISO 8601 UTC.
            why: What the change does for the pilot, in one sentence.
        """
        c = self.context
        change: dict = {}
        if dep.strip():
            change["dep"] = dep.strip().upper()
        if dest.strip():
            change["dest"] = dest.strip().upper()
        if stops is not None:
            change["stops"] = [s.strip().upper() for s in stops.split(",") if s.strip()]
        if altitude_ft is not None:
            change["altitude_ft"] = int(altitude_ft) if float(altitude_ft).is_integer() else altitude_ft
        try:
            if depart:
                when = self.depart(depart)
                change["depart"] = when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # type: ignore[union-attr]
            if not change:
                return "Error: nothing to change: give the field that would change."
            # The route as it would then be, checked by the planner as a
            # typed one is (GET /api/route-check): a bad ident, a stop at
            # the point before it, too many stops, and the stops in the
            # planner's own form. With an end still missing, each ident
            # given is checked alone.
            checked = planner.route_check(
                dep=change.get("dep", c.dep), dest=change.get("dest", c.dest), stops=",".join(change.get("stops", c.stops))
            )
            if "stops" in change:
                change["stops"] = list(checked.stops or [])
        except Exception as err:  # noqa: BLE001
            return failed(err)
        self.actions.append({"change": change, "words": why})
        return as_json({"proposed": change, "words": why})
