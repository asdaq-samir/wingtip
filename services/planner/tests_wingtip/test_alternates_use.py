"""Who may land at a field offered as the IFR alternate reaches the engine
(wingtip.alternates._asked, wingtip_brief::alternates): a military field
that meets 91.169(c) is the pilot's to check, PPR said; joint use is as
any public field."""

from wingtip import alternates, field_use

PROCS = alternates.Approaches(names=("ILS OR LOC RWY 10",), alternate_minimums_url=None)
CLEAR = {"ceiling_ft": 3000.0, "ceiling_unknown": False, "visibility_sm": 6.0, "covers": True, "raw": "TAF KMXF ..."}


def test_a_military_alternate_says_ppr(monkeypatch):
    uses = {"KMXF": {"private": False, "military": "military"}, "KFHU": {"private": False, "military": "joint"}}
    monkeypatch.setattr(field_use, "use_of", lambda ident: uses[ident])
    monkeypatch.setattr(alternates, "approaches", lambda ident: PROCS)
    monkeypatch.setattr(alternates, "_window", lambda ident, eta, kind: CLEAR)
    mxf = alternates.alternate("KMXF", 0.0)
    assert mxf["good"] is None and mxf["meets_standard"] is True
    assert "KMXF is military: prior permission required (PPR)." in mxf["reasons"]
    assert alternates.alternate("KFHU", 0.0)["good"] is True
