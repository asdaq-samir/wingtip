"""A waypoint's own altitude, Cross At or Start At (the profile's per-leg
altitude, the owner's pick of 2026-11-10): flight_plan.resolve_run flies it
on the hop into the waypoint by default, so the change is done by it, and
on the hop out of it where the waypoint is in Asked.altitude_starts, so the
change begins there."""

from types import SimpleNamespace

from wingtip import flight_plan as fp


def _altitudes(monkeypatch, starts):
    flown = []
    monkeypatch.setattr(fp, "resolve_altitude", lambda hop, fixes, profile, key, altitude_ft, *a, **k: flown.append(altitude_ft))
    asked = fp.Asked(profile=None, aircraft_key="", own_altitudes={"VPBNG": 4500.0}, altitude_starts=frozenset(starts))
    for dep, dest, lands in (("C81", "VPBNG", False), ("VPBNG", "KDLH", True)):
        hop = SimpleNamespace(dep_ident=dep, dest_ident=dest, lands=lands)
        fp.resolve_run(SimpleNamespace(hop=hop, fixes=[], fcst_hr=0, window=None), asked)
    return flown


def test_cross_at_flies_the_hop_into_the_waypoint_at_its_altitude(monkeypatch):
    assert _altitudes(monkeypatch, ()) == [4500.0, None]


def test_start_at_flies_the_hop_out_of_it_even_into_a_landing(monkeypatch):
    assert _altitudes(monkeypatch, ("VPBNG",)) == [None, 4500.0]
