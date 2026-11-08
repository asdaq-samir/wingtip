import type { Map as MlMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import type { OverlayTiles } from "../../api/types";
import { usePreferences } from "../../preferences";
import { OVERLAY_LAYERS } from "../overlayTiles";
import { applyOverlayFilters, overlayStyle, setAirportWeather, setOverlayExclusion, volumeOfTile, vorOfTile } from "./glOverlays";
import { airspaceText, glZoom } from "./glStyle";

const TILES: OverlayTiles = {
  cycle: "2026-10-29", name: "2026-10-29-v3-0badf00d", version: 3, bytes: 1, built_at: 1, min_zoom: 4, max_zoom: 12,
  tolerance_m: 4.1, layers: OVERLAY_LAYERS.map(name => ({ name, features: 1 })),
};

const ORIGIN = "https://wingtip.test";

/** As much of a MapLibre map as the filters touch. */
function fakeMap(ids: string[]) {
  const set = { filter: new Map<string, unknown>(), layout: new Map<string, unknown>() };
  const map = {
    style: {},
    getLayer: (id: string) => (ids.includes(id) ? { id } : undefined),
    setFilter: vi.fn((id: string, f: unknown) => set.filter.set(id, f)),
    setLayoutProperty: vi.fn((id: string, k: string, v: unknown) => set.layout.set(`${id}.${k}`, v)),
  } as unknown as MlMap;
  return { map, set };
}

describe("the overlay tiles' layers", () => {
  it("draw the airspace's rings under the marks, and the navaids, fixes, waypoints and airports as marks", () => {
    const { layers } = overlayStyle(TILES, ORIGIN);
    expect(layers.lines!.map(l => l.id)).toEqual(["runway-surface", "runway-centreline", "runway-ends", "airspace-D", "airspace-C", "airspace-B", "airspace-labels"]);
    expect(layers.marks!.map(l => l.id)).toEqual([
      "navaids", "navaids-idents", "fixes", "fixes-idents", "vfr-waypoints", "vfr-waypoints-idents", "airports",
    ]);
    // Each class from its own zoom (AIRSPACE_FROM).
    const from = Object.fromEntries(layers.lines!.map(l => [l.id, l.minzoom]));
    expect(from).toMatchObject({ "airspace-B": glZoom(6), "airspace-C": glZoom(7), "airspace-D": glZoom(8) });
  });

  it("leave out a layer an older archive has not got", () => {
    const { layers } = overlayStyle({ ...TILES, layers: TILES.layers.filter(l => l.name !== "runways") }, ORIGIN);
    expect(layers.lines!.map(l => l.id)).not.toContain("runway-surface");
  });

  it("hide the armed services' and private fields unless asked for, and the route's own fields", () => {
    const { map, set } = fakeMap(["airports", "vfr-waypoints", "airspace-B", "navaids"]);
    usePreferences.setState({ military: false, privateFields: false, airspace: true, navaids: false });
    applyOverlayFilters(map);
    expect(set.filter.get("airports")).toEqual(["all", ["!=", ["get", "military"], "military"], ["!=", ["get", "use"], "private"]]);
    expect(set.layout.get("airspace-B.visibility")).toBe("visible");
    expect(set.layout.get("navaids.visibility")).toBe("none");
    setOverlayExclusion(map, "airports", ["KDLH", "C81"]);
    expect(set.filter.get("airports")).toEqual(["all",
      ["!=", ["get", "military"], "military"], ["!=", ["get", "use"], "private"], ["!", ["in", ["get", "ident"], ["literal", ["C81", "KDLH"]]]]]);
    usePreferences.setState({ military: true, privateFields: true });
    setOverlayExclusion(map, "airports", []);
    expect(set.filter.get("airports")).toEqual(["all"]);
  });

  it("join each field's weather pip onto its symbol by ident", () => {
    const { map, set } = fakeMap(["airports"]);
    setAirportWeather(map, new Map([["KORD", "#1a7f37"], ["KMDW", "#1a7f37"], ["KDLH", "#b3261e"]]));
    const icon = JSON.stringify(set.layout.get("airports.icon-image"));
    expect(icon).toContain(JSON.stringify(["match", ["get", "ident"], ["KORD", "KMDW"], "#1a7f37", ["KDLH"], "#b3261e", ""]));
  });
});

describe("a tapped tile feature", () => {
  it("is the volume the airspace card reads, its tab's words the chart's", () => {
    const shelf = volumeOfTile({ properties: { class: "B", name: "CHICAGO CLASS B", floor_ft: 3000, ceiling_ft: 10000, number: 7 } }, { lat: 42, lon: -88 });
    expect(shelf).toMatchObject({ id: "tile-7", airspace_class: "B", floor_ft: 3000, floor_sfc: false, ceiling_ft: 10000, ceiling_excluded: false });
    expect(airspaceText(shelf)).toBe("B: 100–30");
    // The surface: 0 ft, which the tiles keep.
    const surface = volumeOfTile({ properties: { class: "C", floor_ft: 0, ceiling_ft: 4800 } }, { lat: 0, lon: 0 });
    expect(airspaceText(surface)).toBe("C: 48–SFC");
    // A Class D under a Class B shelf: up to but not including (TNI).
    const d = volumeOfTile({ properties: { class: "D", floor_ft: 0, ceiling_ft: 2500, ceiling_excluded: true, hours_code: "NOTAM" } }, { lat: 0, lon: 0 });
    expect(airspaceText(d)).toBe("D: -25");
    expect(d.hours_code).toBe("NOTAM");
  });

  it("is the VOR the card reads, its remarks a line each", () => {
    const vor = vorOfTile({
      properties: { ident: "GCO", name: "GLACIER", kind: "VORTAC", freq: "108.25", mag_var: -3, restricted: true, remarks: "VOR unusable 072-090\nDME unusable" },
      geometry: { type: "Point", coordinates: [-88.1, 42.4] },
    } as never);
    expect(vor).toMatchObject({ ident: "GCO", kind: "VORTAC", lat: 42.4, lon: -88.1, freq: "108.25", mag_var: -3, restricted: true });
    expect(vor.remarks).toEqual(["VOR unusable 072-090", "DME unusable"]);
  });
});
