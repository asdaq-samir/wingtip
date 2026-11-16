"""A waypoint's own altitude, Cross At or Start At (the profile's per-leg
altitude, the owner's pick of 2026-11-10): flight_plan.resolve_run flies it
on the hop into the waypoint by default, so the change is done by it, and
on the hop out of it where the waypoint is in Asked.altitude_starts, so the
change begins there."""

from types import SimpleNamespace

from wingtip import flight_plan as fp
from wingtip import own_altitude


def _altitudes(monkeypatch, starts, own=None, route=("C81", "VPBNG", "KDLH")):
    flown = []
    monkeypatch.setattr(fp, "resolve_altitude", lambda hop, fixes, profile, key, altitude_ft, *a, **k: flown.append(altitude_ft))
    asked = fp.Asked(profile=None, aircraft_key="", own_altitudes=own or {"VPBNG": 4500.0}, altitude_starts=frozenset(starts))
    seen = own_altitude.visits(route)
    for i, (dep, dest) in enumerate(zip(route, route[1:])):
        hop = SimpleNamespace(dep_ident=dep, dest_ident=dest, lands=dest.startswith("K"))
        fp.resolve_run(SimpleNamespace(hop=hop, fixes=[], fcst_hr=0, window=None, paths=(), visits=(seen[i], seen[i + 1])), asked)
    return flown


def test_cross_at_flies_the_hop_into_the_waypoint_at_its_altitude(monkeypatch):
    assert _altitudes(monkeypatch, ()) == [4500.0, None]


def test_start_at_flies_the_hop_out_of_it_even_into_a_landing(monkeypatch):
    assert _altitudes(monkeypatch, ("VPBNG",)) == [None, 4500.0]


def test_a_start_at_hop_has_its_first_leg_marked_for_the_descent_to_begin_there():
    # own_altitude.marked: the engine's navlog_with_descents starts a Start
    # At descent at the waypoint, the leg before keeping its level to it.
    legs = [{"altitude_ft": 3500.0}, {"altitude_ft": 3500.0}]
    out_of = SimpleNamespace(dep_ident="VPBNG", dest_ident="KDLH")
    assert own_altitude.marked(legs, out_of, {"VPBNG": 3500.0}, frozenset({"VPBNG"})) == [
        {"altitude_ft": 3500.0, "start_at": True},
        {"altitude_ft": 3500.0},
    ]
    assert own_altitude.marked(legs, out_of, {"VPBNG": 3500.0}, frozenset()) == legs  # Cross At
    assert own_altitude.marked(legs, out_of, {}, frozenset({"VPBNG"})) == legs  # no altitude of its own
    assert own_altitude.marked([], out_of, {"VPBNG": 3500.0}, frozenset({"VPBNG"})) == []


# Out to VPBNG, on to BAE and back over VPBNG: a point flown twice.
TWICE = ("C81", "VPBNG", "BAE", "VPBNG", "KDLH")


def test_a_point_flown_twice_keeps_an_altitude_for_each_visit(monkeypatch):
    # The web audit's WEB-2: "VPBNG@2" is the second visit's own alone,
    # where the bare ident was both.
    assert own_altitude.visits(TWICE) == [1, 1, 1, 2, 1]
    assert _altitudes(monkeypatch, (), {"VPBNG@2": 6500.0}, TWICE) == [None, None, 6500.0, None]
    assert _altitudes(monkeypatch, (), {"VPBNG@1": 4500.0, "VPBNG@2": 6500.0}, TWICE)[-4:] == [4500.0, None, 6500.0, None]
    # The bare ident, as the parameter was before: every visit.
    assert _altitudes(monkeypatch, (), {"VPBNG": 5500.0}, TWICE)[-4:] == [5500.0, None, 5500.0, None]
    # Start At the second visit alone: the hop out of it, not the first's.
    assert _altitudes(monkeypatch, ("VPBNG@2",), {"VPBNG@2": 6500.0}, TWICE)[-4:] == [None, None, None, 6500.0]
