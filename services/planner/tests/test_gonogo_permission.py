"""The Go / No-Go's row for a closed, private or military-only field on the route
(app.gonogo.verdict.fields_of, NASR's word on each field, and the engine's
gonogo_brief, which adds the row after the findings): C81 to IL11 asks for the owner's permission with
NASR APT_CON's phone; an all-public route has no such row."""

from app.gonogo import verdict

USE = {
    "IL11": {"private": True, "military": None},
    "KMXF": {"private": False, "military": "military"},
    "KFHU": {"private": False, "military": "joint"},
}
PHONES = {"IL11": "847-323-8911"}


STATUS = {"00MO": "CI"}


def field_permission(idents: tuple[str, ...]) -> dict | None:
    """The fields row, None where the route has none."""
    nothing = {part: {} for part in ("weather", "airspace", "altitude", "fuel", "runways", "balance")}
    return next((i for i in verdict.brief({**nothing, "risk": None}, None, idents, True)["items"] if i["key"] == "fields"), None)


def _nasr(monkeypatch):
    monkeypatch.setattr(verdict.field_use, "record_of", lambda ident: {"status": STATUS.get(ident, "O")})
    monkeypatch.setattr(verdict.field_use, "use_of", lambda ident: USE.get(ident, {"private": False, "military": None}))
    monkeypatch.setattr(verdict.faa_data, "airport_contact", lambda ident, cache_dir: {"phone": PHONES.get(ident), "address": None})


def test_a_private_destination_asks_for_the_owners_permission(monkeypatch):
    _nasr(monkeypatch)
    row = field_permission(("C81", "IL11"))
    assert row == {
        "key": "fields",
        "label": "Fields",
        "tab": "arrive",
        "section": None,
        "finding": "caution",
        "detail": "IL11 is private: land only with the owner's permission (call 847-323-8911)",
    }


def test_a_military_stop_is_ppr_and_joint_use_says_nothing(monkeypatch):
    _nasr(monkeypatch)
    assert field_permission(("C81", "KMXF", "KFHU"))["detail"] == "KMXF is military: prior permission required (PPR)"
    assert field_permission(("C81", "KFHU")) is None


def test_a_closed_destination_is_said_from_nasrs_status(monkeypatch):
    # 00MO, Cooper Flying Service: ARPT_STATUS CI in NASR 2026-10-29 (decision 0043).
    _nasr(monkeypatch)
    row = field_permission(("C81", "00MO"))
    assert row["detail"] == "00MO is closed indefinitely (NASR): it cannot be planned as a landing field"
