"""wingtip.terrain_detour: a way round high ground by fields with fuel, the
engine's (terrain_way_round; its own tests hold the highest cruise and the
search), on the ground and the fields read here."""

import numpy as np
import pandas as pd

from wingtip import fixes, terrain_detour


def _fields(*rows):
    return pd.DataFrame(
        [{"ident": i, "name": f"{i} FIELD", "lat": la, "lon": lo} for i, la, lo in rows], columns=["ident", "name", "lat", "lon"]
    )


def test_round_a_ridge_by_the_field_at_its_end(monkeypatch):
    # A ridge 12,000 ft high across the straight line at 1 to 2 degrees
    # east, from 1 degree south to 3 north; low ground elsewhere.
    def heights(lats, lons):
        ridge = (lons > 1.0) & (lons < 2.0) & (lats > -1.0) & (lats < 3.0)
        return np.where(ridge, 12_000.0, 500.0)

    monkeypatch.setattr(terrain_detour, "heights_ft", heights)
    fields = _fields(("SOUTH", -1.6, 1.5), ("NORTH", 3.6, 1.5), ("ONRIDGE", 0.0, 1.5))
    way = terrain_detour.way_round((0.0, 0.0), (0.0, 3.0), 10_950, fields=fields)
    assert [w["ident"] for w in way] == ["SOUTH"]


def test_a_clear_line_needs_no_way_round(monkeypatch):
    monkeypatch.setattr(terrain_detour, "heights_ft", lambda lats, lons: np.full(lats.shape, 500.0))
    assert terrain_detour.way_round((0.0, 0.0), (0.0, 3.0), 10_950, fields=_fields(("A", 0.0, 1.5))) == []


def test_a_turn_with_no_field_is_named_off_a_fix_or_the_way_is_none(monkeypatch):
    # The ridge with no field anywhere: the way's own turns, each named as
    # a point of the pilot's own; with no fix to name one off, no way.
    def heights(lats, lons):
        return np.where((lons > 1.0) & (lons < 2.0) & (lats > -1.0) & (lats < 3.0), 12_000.0, 500.0)

    monkeypatch.setattr(terrain_detour, "heights_ft", heights)
    monkeypatch.setattr(fixes, "frd_near", lambda lat, lon: {"ident": "OWN", "name": "own point"})
    way = terrain_detour.way_round((0.0, 0.0), (0.0, 3.0), 10_950, fields=_fields())
    assert way and all(w["ident"] == "OWN" for w in way)
    monkeypatch.setattr(fixes, "frd_near", lambda lat, lon: None)
    assert terrain_detour.way_round((0.0, 0.0), (0.0, 3.0), 10_950, fields=_fields()) is None
