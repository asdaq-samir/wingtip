"""The words in the airspace's tabs on the map, from the engine, for the
map to draw as they are: the charts job writes them into the overlay
tiles (services/jobs/charts: `airspace_labels`, `special_use_labels`) and
the 3D view's volumes carry them (wingtip.airspace_volumes), so the 2D
chart and the 3D view write an airspace the same way and no app formats
a figure of its own.

- A Class B, C or D shelf as the sectional writes it, the ceiling over
  the floor in hundreds of feet MSL, "100" over "30", "T" and "-30"
  (the engine's `airspace_shelf_label`; FAA Aeronautical Chart User's
  Guide, 9 July 2026, VFR Terms and Symbols, Airspace, p. 16, and its
  legend Airspace Information, p. 52).
- A special use area's name and limits, "M-BRADY NOR*:" over
  "3600-17999" (the engine's `special_use_tab`), from the FAA's special
  use airspace feature service as wingtip.sua `_area` reads it.
"""

from __future__ import annotations


from wingtip.engine import ask as engine


def shelf_tab(volume: dict) -> str | None:
    """A Class B, C or D volume's tab, as wingtip.phone_pack_shapes
    `_volume_drawn` describes it (floor_ft and floor_ref, ceiling_ft MSL,
    ceiling_excluded for UPPER_DESC TNI); None for another class or a
    volume with no ceiling."""
    asked = {
        "class": volume["class"],
        "floor_ft": volume["floor_ft"],
        "floor_ref": volume.get("floor_ref"),
        "ceiling_ft": volume["ceiling_ft"],
        "ceiling_excluded": bool(volume.get("ceiling_excluded")),
    }
    label = engine("airspace_shelf_label", **asked)
    return label["text"] if label else None


def special_use_tab(area: dict) -> dict | None:
    """The engine's tab for one special use area as wingtip.sua `_area`
    describes it: {"text", "name", "floor_ft", "floor_ref", "ceiling_ft",
    "ceiling_ref"}, or None for a piece marked EXCLUSION or a limit with
    no figure."""
    asked = {
        "name": area["name"],
        "type": area["type"].strip(),
        "floor": {"ft": area["floor_ft"], "code": area["floor_ref"], "desc": area.get("floor_desc")},
        "ceiling": {"ft": area["ceiling_ft"], "code": area["ceiling_ref"], "desc": area.get("ceiling_desc")},
        "excluded": bool(area.get("excluded")),
    }
    return engine("special_use_tab", **asked)
