"""The airports layer's `use` against NASR's codes (APT_BASE.csv,
OWNERSHIP_TYPE_CODE and FACILITY_USE_CODE): a field the armed services own
and keep closed to the public is "military", so the map's Private Fields
switch (which hides "private") and its Military Fields switch (which hides
military "military") agree on every app; a joint-use field is public use."""

import json

from charts import airports


def test_a_military_field_is_military_use_not_private(tmp_path):
    # KMXF, Maxwell AFB, is OWNERSHIP_TYPE_CODE MA and FACILITY_USE_CODE
    # PR; FHU, Sierra Vista Municipal-Libby AAF, is MR and PU, joint use
    # (NASR 2026-10-29). The private switch must not hide the first, and
    # the second is public use.
    path = tmp_path / "APT_BASE.csv"
    columns = ["SITE_NO", "SITE_TYPE_CODE", "ARPT_ID", "ICAO_ID", "ARPT_NAME", "ARPT_STATUS", "LAT_DECIMAL", "LONG_DECIMAL"]
    columns += ["OWNERSHIP_TYPE_CODE", "FACILITY_USE_CODE"]
    rows = [
        ["1", "A", "MXF", "KMXF", "MAXWELL AFB", "O", "32.38", "-86.36", "MA", "PR"],
        ["2", "A", "FHU", "KFHU", "SIERRA VISTA MUNI-LIBBY AAF", "O", "31.59", "-110.34", "MR", "PU"],
        ["3", "A", "IL11", "", "DONALD ALFRED GADE", "O", "42.45", "-88.12", "PR", "PR"],
    ]
    path.write_text("\n".join(",".join(f'"{v}"' for v in r) for r in [columns, *rows]) + "\n")
    found = {f["properties"]["faa_id"]: f["properties"] for f in (json.loads(line) for line in airports.airport_features(path, None, None))}
    assert {k: (p["use"], p.get("military")) for k, p in found.items()} == {
        "MXF": ("military", "military"),
        "FHU": ("public", "joint"),
        "IL11": ("private", None),
    }
