"""wingtip.flight_procedures.fix_minutes: each procedure fix's minutes from
its leg's start, for FPL's list to time it as it times a stop."""

from wingtip import procedure_paths
from wingtip.flight_procedures import fix_minutes

# Due north along a meridian, a minute of latitude a nautical mile: four
# points 10 nm apart.
PATH = [[46.0, -92.0], [46.0 + 10 / 60, -92.0], [46.0 + 20 / 60, -92.0], [46.0 + 30 / 60, -92.0]]


def _path(points=PATH):
    return {"path": points, "nm": procedure_paths.length_nm(points)}


def _fix(ident, at, missed=False):
    return {"ident": ident, "lat": PATH[at][0], "lon": PATH[at][1], "missed": missed}


def test_an_approachs_fixes_are_timed_back_from_the_legs_end():
    # 30 nm at 120 kt is 15 minutes; the leg's ETE 20, its climb slower.
    approach = {"fixes": [_fix("IAF", 1), _fix("FAF", 2), _fix("MISSA", 3, missed=True)]}
    got = fix_minutes(_path(), (None, None, approach), ete_min=20.0, groundspeed_kt=120.0)
    assert got == {"IAF": 10.0, "FAF": 15.0}


def test_a_departures_fixes_are_timed_from_the_legs_start():
    departure = {"fixes": [_fix("FIRST", 1), _fix("SECOND", 2)]}
    got = fix_minutes(_path(), (departure, None, None), ete_min=20.0, groundspeed_kt=120.0)
    assert got == {"FIRST": 5.0, "SECOND": 10.0}


def test_a_fix_off_the_path_has_no_time():
    away = {"ident": "AWAY", "lat": 47.5, "lon": -90.0, "missed": False}
    got = fix_minutes(_path(), (None, {"fixes": [away]}, None), ete_min=20.0, groundspeed_kt=120.0)
    assert got == {}
