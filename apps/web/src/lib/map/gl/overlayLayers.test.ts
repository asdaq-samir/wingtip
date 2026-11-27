import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import { OVERLAY_LAYERS } from "../sources/overlayTiles";
import { OVERLAY_EXPRESSIONS, OVERLAY_FRAGMENTS, OVERLAY_GROUPS, OVERLAY_LINES, OVERLAY_MARKS } from "../../generated/overlayLayers";
import { AIRPORT_ICON_SIZE, AIRPORT_SHOWN, AIRPORT_TILE_LAYERS, AIRSPACE_TILE_LAYERS, overlayStyle } from "./glOverlays";
import { AIRPORT_IDENT_INK, TILE_AIRPORT_ICON } from "./airportIcons";
import { TAB_BOX } from "./glStyle";
import { suaTabLayout } from "./glSuaLabels";
import { GL_FONT_BOLD } from "./layers/common";
import { dimLayer } from "./mapDim";

const TILES: OverlayTiles = {
  cycle: "2026-10-29",
  name: "2026-10-29-v3-0badf00d",
  version: 3,
  bytes: 1,
  built_at: 1,
  min_zoom: 4,
  max_zoom: 12,
  tolerance_m: 4.1,
  layers: OVERLAY_LAYERS.map((name) => ({ name, features: 1 })),
};

/** The hand-written style as it stands, each slot's layers by id, in order. */
const today = overlayStyle(TILES, "https://wingtip.test").layers;
const byId = (layers: LayerSpecification[]) => layers.map((l) => [l.id, l] as const);

describe("the generated overlay layers (design/map-style.json)", () => {
  it("are today's, in today's order", () => {
    expect(OVERLAY_LINES.map((l) => l.id)).toEqual(today.lines!.map((l) => l.id));
    expect(OVERLAY_MARKS.map((l) => l.id)).toEqual(today.marks!.map((l) => l.id));
  });

  it.each([...byId(today.lines!), ...byId(today.marks!)])("draw %s as today, at night too", (id, layer) => {
    const generated = [...OVERLAY_LINES, ...OVERLAY_MARKS].find((l) => l.id === id)!;
    // As the map takes them: through the Dimmer (mapDim), as overlayStyle hands them.
    expect(dimLayer(generated)).toEqual(layer);
  });

  it("name the parts the app's own layers wear as today's", () => {
    expect(OVERLAY_EXPRESSIONS.airportIconSize).toEqual(AIRPORT_ICON_SIZE);
    expect([OVERLAY_EXPRESSIONS.militaryShown, OVERLAY_EXPRESSIONS.privateShown]).toEqual(AIRPORT_SHOWN);
    expect(OVERLAY_EXPRESSIONS.tileAirportIcon).toEqual(TILE_AIRPORT_ICON);
    expect(OVERLAY_EXPRESSIONS.airportIdentInk).toEqual(AIRPORT_IDENT_INK);
    expect(OVERLAY_FRAGMENTS.tabBox).toEqual(TAB_BOX);
    expect(OVERLAY_FRAGMENTS.suaTab).toEqual(suaTabLayout(GL_FONT_BOLD));
  });

  it("turn off with today's switches", () => {
    expect([...OVERLAY_GROUPS.airspace].sort()).toEqual([...AIRSPACE_TILE_LAYERS].sort());
    expect(OVERLAY_GROUPS.airports).toEqual(AIRPORT_TILE_LAYERS);
    expect(OVERLAY_GROUPS.navaids).toEqual(["fixes", "fixes-idents", "navaids", "navaids-idents"]);
    expect(OVERLAY_GROUPS.waypoints).toEqual(["vfr-waypoints", "vfr-waypoints-idents"]);
  });
});
