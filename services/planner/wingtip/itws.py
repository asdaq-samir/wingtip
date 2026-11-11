"""The Integrated Terminal Weather System's alerts, from its SWIM feed
(ITWS_Alert, the owner's SCDS subscription; 34 ITWS sites heard on
2026-11-09): the microburst, wind shear, gust front, tornado and storm
alerts a tower's ITWS gives its controllers for an airport, who relay
them to pilots (AIM 4-3-7, Low Level Wind Shear/Microburst Detection
Systems: "ITWS provides alerts for microbursts, wind shear, and
significant thunderstorm activity ... oriented to the threshold or
departure end of the runway").

Each message is one product of one site, its header naming the product
(product_msg_id, product_msg_name), the airports it is for and when it
expires (product_header_expiration_time_seconds, about three minutes on);
a product is sent again each update, so an alert lasts while its product
keeps saying so, and goes when it says the alert is off or expires.
Kept here (wingtip.live_reports, kind "itws"), one report an airport and
product, only while it alerts:

- 9840 Configured Alerts: each runway region's alert ("27LA", 27L's
  arrivals; "27LD", its departures), its type, its value in knots and
  where along the runway it lies, from first to last location: RWY the
  runway, 1MF..3MF one to three miles on final, 1MD..2MD on departure,
  AIM 4-3-7's alert area (the ARENA, "on the runway center line from a 3
  mile final to the runway to a 2 mile departure").
- 9893 Microburst ATIS and 9894 Wind Shear ATIS: whether the alert is
  on for the airport's ATIS (pmsg_status ON or OFF).
- 9839 Tornado Alert: a tornado detected within its radius (nm).
- 9834 Gust Front ETI: a gust front expected at the airport, in minutes.
- 9857 Hazard Text 5nm: the storm cells within 5 nm, each as the product
  words it ("ECHOTOP: 170").

The maps and the TRACON-wide products (9832, 9833, 9838, 9858, 9837) are
not kept: ingest acknowledges them unread by their topic
("ITWS_Alert/<product>/<site>/<airport>"). The product numbers and names
are the feed's own (the FAA's ITWS product set as SWIM publishes it).

No figure is judged here: what an alert means for a flight is the
engine's (the Go / No-Go's wind shear finding).
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from . import live_reports

KIND = "itws"
#: The products kept, by the number the feed gives them (its topic's
#: second word), with the feed's own names.
KEPT = {
    "9840": "Configured Alerts Product",
    "9893": "Microburst ATIS Product",
    "9894": "Wind Shear ATIS Product",
    "9839": "Tornado Alert Product",
    "9834": "Gust Front ETI Product",
    "9857": "Hazard Text 5nm Product",
}
#: A configured alert's type as its first two letters write it (the ITWS
#: ribbon display's alert codes, MBA a microburst alert, WSA a wind shear
#: alert): what kind of alert a pilot is told it is. Another code is
#: given as the feed wrote it.
ALERT_TYPES = {"MB": "microburst", "WS": "wind shear", "GF": "gust front"}
#: A location along a runway's alert area: RWY, or a number of miles on
#: final (MF) or departure (MD).
_PLACE = re.compile(r"^(\d)M([FD])$")


def _text(root, tag: str) -> str:
    found = root.find(f".//{tag}")
    return (found.text or "").strip() if found is not None and found.text else ""


def _number(root, tag: str) -> float | None:
    try:
        return float(_text(root, tag))
    except ValueError:
        return None


def _where(code: str) -> str:
    """A location as a pilot is told it (AIM 4-3-7's "3 mile final")."""
    code = code.strip().upper()
    if code == "RWY":
        return "runway"
    found = _PLACE.match(code)
    if found:
        return f"{found[1]} mile {'final' if found[2] == 'F' else 'departure'}"
    return code.lower()


def runway_alert(region: str, code: str, value_kt: float | None, first: str, last: str) -> dict:
    """One runway region's alert: its runway ("27LA" is 27L), whether its
    arrivals or departures, what alert, how strong and where."""
    region = region.replace(";", "").strip().upper()
    runway, end = region[:-1].strip(), region[-1:]
    kind = ALERT_TYPES.get(code.strip().upper()[:2], code.strip())
    direction = {"A": "arrival", "D": "departure"}.get(end, "")
    span = _where(first) if first.strip().upper() == last.strip().upper() else f"{_where(first)} to {_where(last)}"
    value = f" {value_kt:.0f} kt" if value_kt else ""
    words = f"Runway {runway} {direction} {kind} alert{value}, {span}".replace("  ", " ")
    return {
        "runway": runway,
        "direction": direction or None,
        "alert": kind,
        "code": code.strip(),
        "value_kt": value_kt,
        "from": _where(first),
        "to": _where(last),
        "words": words,
    }


def alerts(xml: str) -> tuple[str, list[str], float | None, list[dict]]:
    """One ITWS message read: its product number, its airports, when it
    expires (s), and the alerts it gives (each {"alert", "words", ...});
    none where it alerts nothing, or is not one of KEPT."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return "", [], None, []
    product = _text(root, "product_msg_id")
    airports = _text(root, "product_header_airports").split()
    expires = _number(root, "product_header_expiration_time_seconds")
    found: list[dict] = []
    if product == "9840":
        for alert in root.iter("ca_rwy_alert"):
            code = _text(alert, "ca_ra_type")
            if code:
                found.append(
                    runway_alert(
                        _text(alert, "ca_ra_region_id"),
                        code,
                        _number(alert, "ca_ra_value"),
                        _text(alert, "ca_ra_first_loc"),
                        _text(alert, "ca_ra_last_loc"),
                    )
                )
    elif product in ("9893", "9894"):
        if _text(root, "pmsg_status").upper() == "ON":
            kind = "microburst" if product == "9893" else "wind shear"
            found.append({"alert": kind, "words": f"{kind.capitalize()} alert on the ATIS"})
    elif product == "9839":
        if _text(root, "trnal_exists_flag") == "1":
            radius = _number(root, "trnal_radius")
            within = f" within {radius:.0f} nm" if radius else ""
            found.append({"alert": "tornado", "words": f"Tornado detected{within}"})
    elif product == "9834":
        if _text(root, "gf_eti_near") == "1":
            minutes = _number(root, "gf_eti_minutes")
            when = f" in {minutes:.0f} min" if minutes is not None and minutes >= 0 else ""
            found.append({"alert": "gust front", "words": f"Gust front expected{when}", "minutes": minutes})
    elif product == "9857":
        for cell in root.iter("ht_cell"):
            words = _text(cell, "htc_msg_text")
            if words:
                found.append(
                    {
                        "alert": "storm cell",
                        "words": f"Storm within 5 nm: {words}",
                        "lat": _number(cell, "htc_latitude"),
                        "lon": _number(cell, "htc_longitude"),
                    }
                )
    return product, airports, expires, found


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One ITWS message kept: each airport's alerts of its product put in
    the store, or taken away where it alerts nothing now. ingest's handler
    for the feed (services/ingest). How many alerts it gave."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    product, airports, expires, found = alerts(xml)
    if product not in KEPT:
        return 0
    for airport in airports:
        key = f"{live_reports.ident(airport)}:{product}"
        if found:
            live_reports.put(
                KIND,
                key,
                {"airport": airport, "product": product, "name": KEPT[product], "alerts": found, "expires": expires},
                place=airport,
                ends=expires,
                now=now,
            )
        else:
            live_reports.drop(KIND, key)
    return len(found) * len(airports)


def at_airports(airports: list[str], now: float | None = None) -> list[dict]:
    """The ITWS alerts in force at these airports: one entry an airport
    and product, each {"airport", "product", "name", "alerts", "expires",
    "heard"}."""
    return live_reports.at(KIND, airports, now=now)
