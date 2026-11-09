"""What the FAA's SWIM feeds say now, put as the Go / No-Go takes it, for
the phones' POST /api/go-no-go as the web's lib/liveReports puts it for
the Brief: the ITWS alerts at the route's airports in a line each, the
Command Center's programs (under IFR) and SFDPS's word for a special-use
area at the pass. What they come to is the engine's verdict."""
from datetime import datetime, timezone

from wingtip import flow, itws, saa


def zulu(unix_s: float) -> str:
    """A time as the app says one in Zulu: "2130Z"."""
    return datetime.fromtimestamp(unix_s, timezone.utc).strftime("%H%MZ")


def itws_lines(airports: list[str]) -> list[str]:
    """Each ITWS alert at these airports in a line with its airport."""
    return [f"{p['airport']}: {a['words']}" for p in itws.at_airports(airports) for a in p["alerts"]]


def program_line(p: dict) -> str | None:
    """A program in a line, "Ground stop at EWR until 2130Z, delays
    average 45 min"; a restriction gives none."""
    if p.get("restriction") or not p.get("program"):
        return None
    until = f" until {zulu(p['ends'])}" if p.get("ends") is not None else ""
    delay = f", delays average {p['average_delay_min']} min" if p.get("average_delay_min") is not None else ""
    return f"{p['program'][0].upper()}{p['program'][1:]} at {p['airport']}{until}{delay}"


def program_lines(airports: list[str]) -> list[str]:
    return [line for p in flow.at_airports(airports) if (line := program_line(p))]


def live_when(scheduled: str, status: dict | None, at: datetime | None) -> str:
    """SFDPS's word for an area where it holds at the pass (active-now,
    cold-now), else the times of use's (the web's liveWhen)."""
    if not status or status.get("active") is None:
        return scheduled
    if status.get("until") is not None and at is not None and at.timestamp() > status["until"]:
        return scheduled
    return "active-now" if status["active"] else "cold-now"


def area_status(names: list[str], now: float) -> dict[str, dict]:
    return saa.status(names, now=now) if names else {}
