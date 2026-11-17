"""A known airport and its stubs, for the tests of an airport's card
(test_airports) and of the tools and endpoints that read one: the tables,
the airspace and the weather stubbed, so what is tested is what the code
makes of them, not OurAirports or aviationweather.gov."""

from wingtip import airports, airspace_at, glmp, remarks, weather

DULUTH = {
    "ident": "KDLH",
    "source_ident": "KDLH",
    "name": "Duluth International Airport",
    "municipality": "Duluth",
    "region": "US-MN",
    "lat": 46.8421,
    "lon": -92.1936,
    "elevation_ft": 1428.0,
    "kind": "medium",
}


# The engine's reading of "ACTVT MIRL RWY 09/27 - CTAF." (lighting_read).
MIRL = {
    "code": "MIRL",
    "name": "Runway edge lights, medium intensity",
    "runways": ["09/27"],
    "pilot_controlled": True,
    "frequency": "CTAF",
    "clicks": None,
    "tower_closed": False,
    "preset": None,
    "brighter": False,
    "schedule": None,
    "continuous": False,
    "nonstandard": False,
    "how": "Key the mic on CTAF",
    "as_written": "ACTVT MIRL RWY 09/27 - CTAF.",
}


def stub_place(monkeypatch, place=DULUTH, frequencies=(), runways=(), metar=None, surface_class="C", nearby=None, modelled=None, taf=None):
    monkeypatch.setattr(airports, "find_place", lambda ident: place if ident.upper() in ("KDLH", "DLH") else None)
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: list(frequencies))
    monkeypatch.setattr(airports, "get_runways", lambda ident: list(runways))
    # Its class at the surface (the engine's, wingtip.airspace_at), the FAA's shapefile stubbed (conftest).
    monkeypatch.setattr(airspace_at, "surface_airspace", lambda *_: {"airspace_class": surface_class, "surface_airspace": None})
    monkeypatch.setattr(
        remarks,
        "airport_notes",
        lambda faa_id: {
            "lighting": ["ACTVT MIRL RWY 09/27 - CTAF."] if faa_id == "DLH" else [],
            "lights": [MIRL] if faa_id == "DLH" else [],
            "light_notes": [],
            "radio": [],
            "standard_keying": faa_id == "DLH",
        },
    )
    monkeypatch.setattr(remarks, "runway_turf", lambda faa_id: {})
    if isinstance(metar, Exception):

        def fail(idents):
            raise metar

        monkeypatch.setattr(weather, "metar_for_idents", fail)
    else:
        monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {i: metar for i in idents})
    monkeypatch.setattr(weather, "nearest_report", lambda lat, lon, exclude=None: nearby)
    if isinstance(taf, Exception):

        def no_tafs(idents):
            raise taf

        monkeypatch.setattr(weather, "taf_for_idents", no_tafs)
    else:
        monkeypatch.setattr(weather, "taf_for_idents", lambda idents: {i: taf for i in idents})
    if isinstance(modelled, Exception):

        def down(lat, lon):
            raise modelled

        monkeypatch.setattr(glmp, "at", down)
    else:
        monkeypatch.setattr(glmp, "at", lambda lat, lon: modelled)
