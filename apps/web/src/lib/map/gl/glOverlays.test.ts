import type { Map as MlMap, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import type { OverlayTiles } from "../../api/types";
import { usePreferences } from "../../preferences";
import { closeEmergency, openEmergency } from "../../emergencyStore";
import { watchOverlayFilters } from "./overlayFilters";
import { OVERLAY_LAYERS } from "../sources/overlayTiles";
import {
  AIRSPACE_TILE_LAYERS,
  applyOverlayFilters,
  overlayStyle,
  AIRPORTS_SOURCE,
  OVERLAY_SOURCE,
  markSelectedAirport,
  setAirportWeather,
  setOverlayExclusion,
} from "./glOverlays";
import { volumeOfTile, vorOfTile } from "./glTileFeatures";
import { glZoom } from "./glStyle";
import { CHART } from "../../tokens";

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

const ORIGIN = "https://wingtip.test";

/** As much of a MapLibre map as the filters touch. */
function fakeMap(ids: string[]) {
  const set = { filter: new Map<string, unknown>(), layout: new Map<string, unknown>(), state: new Map<string, unknown>() };
  const map = {
    style: {},
    setGlobalStateProperty: vi.fn((k: string, v: unknown) => set.state.set(k, v)),
    getSource: () => ({}),
    setFeatureState: vi.fn((f: { id: string }, v: unknown) => set.state.set(`feature:${f.id}`, v)),
    getLayer: (id: string) => (ids.includes(id) ? { id } : undefined),
    setFilter: vi.fn((id: string, f: unknown) => set.filter.set(id, f)),
    setLayoutProperty: vi.fn((id: string, k: string, v: unknown) => set.layout.set(`${id}.${k}`, v)),
  } as unknown as MlMap;
  return { map, set };
}

describe("the overlay tiles' layers", () => {
  it("draw the airspace's rings under the marks, and the navaids, fixes, waypoints and airports as marks", () => {
    const { layers } = overlayStyle(TILES, ORIGIN);
    expect(layers.lines!.map((l) => l.id)).toEqual([
      "runway-surface",
      "runway-centreline",
      "runway-ends",
      "sua-band",
      "sua-line",
      "airspace-D-band",
      "airspace-D",
      "airspace-C-band",
      "airspace-C",
      "airspace-B-band",
      "airspace-B",
      "airspace-labels",
      "sua-labels",
    ]);
    expect(layers.marks!.map((l) => l.id)).toEqual([
      // Bottom to top: the VORs over the waypoints and fixes, so their idents are placed first.
      "fixes",
      "fixes-idents",
      "vfr-waypoints",
      "vfr-waypoints-idents",
      "navaids",
      "navaids-idents",
      // Each tier's towered fields over its others, one ink a layer (W1).
      "airports",
      "airports-towered",
      "airports-c",
      "airports-c-towered",
      "airports-kept",
      "airports-kept-towered",
    ]);
    // Each class from its own zoom (AIRSPACE_FROM).
    const from = Object.fromEntries(layers.lines!.map((l) => [l.id, l.minzoom]));
    expect(from).toMatchObject({ "airspace-B": glZoom(5), "airspace-C": glZoom(5), "airspace-D": glZoom(7) });
  });

  it("write one tab a shelf from the label points", () => {
    const label = (tiles: OverlayTiles) =>
      overlayStyle(tiles, ORIGIN).layers.lines!.find((l) => l.id === "airspace-labels") as SymbolLayerSpecification | undefined;
    const points = label(TILES)!;
    expect(points["source-layer"]).toBe("airspace_labels");
    expect(points.layout).toMatchObject({
      "text-rotate": ["get", "angle"],
      "icon-rotate": ["get", "angle"],
      "text-rotation-alignment": "map",
    });
    expect(points.layout!["symbol-placement"]).toBeUndefined();
  });

  it("turn the airspace, its bands and labels, and the special-use areas off with the Airspace setting", () => {
    expect(AIRSPACE_TILE_LAYERS).toEqual(
      expect.arrayContaining(["airspace-C-band", "airspace-C", "airspace-labels", "sua-band", "sua-line", "sua-labels"]),
    );
  });

  it("leave the open card's field's ident to the ring's own, by its feature state, its mark drawn over", () => {
    const { map, set } = fakeMap(["airports"]);
    markSelectedAirport(map, "KMSN", true);
    expect(set.state.get("feature:KMSN")).toEqual({ selected: true });
    markSelectedAirport(map, "KMSN", false);
    expect(set.state.get("feature:KMSN")).toEqual({ selected: false });
    const style = overlayStyle(TILES, ORIGIN);
    const airports = style.layers.marks!.find((l) => l.id === "airports") as SymbolLayerSpecification;
    // Hidden by its opacity and the feature's state alone, so a tap lays no tile out again, and its ink one colour a
    // layer, read by no feature, so a night commit of the Dimmer lays none out either (W1); the words dimmed by their
    // ink at night (labelInk), their opacity left as it is; the mark by the Dimmer's share, a constant a step repaints.
    const selected = ["boolean", ["feature-state", "selected"], false];
    expect(airports.paint!["text-opacity"]).toEqual(["case", selected, 0, 1]);
    expect(JSON.stringify(airports.paint!["text-color"])).not.toContain("feature-state");
    expect(JSON.stringify(airports.paint!["text-color"])).toContain(CHART.untowered);
    const towered = style.layers.marks!.find((l) => l.id === "airports-towered") as SymbolLayerSpecification;
    expect(JSON.stringify(towered.paint!["text-color"])).toContain(CHART.towered);
    expect(towered.filter).toEqual(expect.arrayContaining([["==", ["get", "towered"], true]]));
    const dim = ["*", ["coalesce", ["global-state", "mapDim"], 1], 1];
    expect(airports.paint!["icon-opacity"]).toEqual(dim);
    expect(JSON.stringify(airports.filter)).not.toContain("selected");
    // The fields on a source of their own, each by its ident; the rest on another, each ring by its field's.
    expect(airports.source).toBe(AIRPORTS_SOURCE);
    expect(style.sources[AIRPORTS_SOURCE]).toMatchObject({ promoteId: { airports: "ident" } });
    expect(style.sources[OVERLAY_SOURCE]).toMatchObject({ promoteId: { airspace: "ident" } });
    expect(style.layers.lines!.every((l) => "source" in l && l.source === OVERLAY_SOURCE)).toBe(true);
  });

  it("dim the VOR's tag with its words, and the chart's white words, by their colour at night (R7-2, R7-5)", () => {
    const style = overlayStyle(TILES, ORIGIN);
    const all = [...style.layers.lines!, ...style.layers.marks!] as SymbolLayerSpecification[];
    const of = (id: string) => all.find((l) => l.id === id)!;
    // The tag a distance field in the towered blue, dimmed by its colour; neither faded by its opacity.
    const vor = of("navaids-idents");
    expect(vor.paint!["icon-color"]).toEqual([
      "interpolate",
      ["linear"],
      ["coalesce", ["global-state", "mapDim"], 1],
      0,
      "black",
      1,
      CHART.towered,
    ]);
    expect(vor.paint!["icon-opacity"]).toBeUndefined();
    // White words on a dark halo or tab at the words' light, the halo whole.
    for (const id of ["navaids-idents", "runway-ends", "airspace-labels", "sua-labels"]) {
      expect(JSON.stringify(of(id).paint!["text-color"]), id).toContain(JSON.stringify(["global-state", "labelNight"]));
      expect(of(id).paint!["text-opacity"], id).toBeUndefined();
    }
    expect(of("runway-ends").paint!["text-halo-color"]).toBe(CHART.tag);
  });

  it("name the towered fields wherever they are drawn, from 5, and every other field from 8, each mark a little apart", () => {
    const airports = overlayStyle(TILES, ORIGIN).layers.marks!.find((l) => l.id === "airports") as SymbolLayerSpecification;
    expect(airports.minzoom).toBe(glZoom(4));
    expect(airports.layout!["text-field"]).toEqual([
      "step",
      ["zoom"],
      ["case", ["any", ["==", ["get", "towered"], true], ["==", ["get", "size"], "largest"]], ["get", "ident"], ""],
      glZoom(8),
      ["get", "ident"],
    ]);
    expect(airports.layout!["icon-padding"]).toBe(2);
    // No bare mark: a field's mark and ident are placed together; a Class B's and the open card's keep the mark.
    expect(airports.layout!["text-optional"]).toBe(false);
    const kept = overlayStyle(TILES, ORIGIN).layers.marks!.find((l) => l.id === "airports-kept") as SymbolLayerSpecification;
    expect(kept.layout!["text-optional"]).toBe(true);
    expect(kept.layout!["icon-allow-overlap"]).toBe(true);
    expect(airports.layout!["symbol-sort-key"]).toEqual(["get", "rank"]);
  });

  it("hide the armed services' and private fields unless asked for, and the route's own fields", () => {
    const { map, set } = fakeMap(["airports", "vfr-waypoints", "airspace-B", "navaids"]);
    usePreferences.setState({ privateMilitary: false, aeronautical: true });
    applyOverlayFilters(map);
    expect(set.state.get("showMilitary")).toBe(false);
    expect(set.state.get("showPrivate")).toBe(false);
    expect(set.layout.get("airspace-B.visibility")).toBe("visible");
    expect(set.layout.get("navaids.visibility")).toBe("visible");
    // Aeronautical off: the airspace and the VORs go together.
    usePreferences.setState({ aeronautical: false });
    applyOverlayFilters(map);
    expect(set.layout.get("airspace-B.visibility")).toBe("none");
    expect(set.layout.get("navaids.visibility")).toBe("none");
    usePreferences.setState({ privateMilitary: true });
    applyOverlayFilters(map);
    expect(set.state.get("showMilitary")).toBe(true);
    expect(set.state.get("showPrivate")).toBe(true);
    setOverlayExclusion(map, "airports", ["KDLH", "C81", "KDLH"]);
    expect(set.state.get("routeAirports")).toEqual(["C81", "KDLH"]);
    setOverlayExclusion(map, "waypoints", ["VPXYZ"]);
    expect(set.state.get("routeWaypoints")).toEqual(["VPXYZ"]);
    const marks = overlayStyle(TILES, ORIGIN).layers.marks!;
    const airports = marks.find((l) => l.id === "airports") as SymbolLayerSpecification;
    expect(JSON.stringify(airports.filter)).toContain(JSON.stringify(["global-state", "routeAirports"]));
    expect(JSON.stringify(airports.filter)).toContain(JSON.stringify(["global-state", "showMilitary"]));
    for (const id of ["vfr-waypoints", "vfr-waypoints-idents"])
      expect(JSON.stringify((marks.find((l) => l.id === id) as SymbolLayerSpecification).filter)).toContain(
        JSON.stringify(["global-state", "routeWaypoints"]),
      );
    // Each on a source of its own, so a route's edit lays out those tiles alone, not the airspace's and the fixes'.
    const byRoute = marks.filter((l) => /routeAirports|routeWaypoints/.test(JSON.stringify((l as SymbolLayerSpecification).filter)));
    expect(byRoute.map((l) => l.id)).toEqual([
      "vfr-waypoints",
      "vfr-waypoints-idents",
      "airports",
      "airports-towered",
      "airports-c",
      "airports-c-towered",
      "airports-kept",
      "airports-kept-towered",
    ]);
    expect(byRoute.some((l) => (l as SymbolLayerSpecification).source === OVERLAY_SOURCE)).toBe(false);
  });

  it("show the private and military fields while the emergency assistant is open, the switches theirs again once it closes", () => {
    const { map, set } = fakeMap(["airports"]);
    usePreferences.setState({ privateMilitary: false });
    const stop = watchOverlayFilters(map);
    expect(set.state.get("showPrivate")).toBe(false);
    openEmergency("flying");
    expect(set.state.get("showPrivate")).toBe(true);
    expect(set.state.get("showMilitary")).toBe(true);
    // The pilot's switches are left as they were.
    expect(usePreferences.getState().privateMilitary).toBe(false);
    closeEmergency();
    expect(set.state.get("showPrivate")).toBe(false);
    expect(set.state.get("showMilitary")).toBe(false);
    stop();
    openEmergency("flying");
    expect(set.state.get("showPrivate")).toBe(false);
    closeEmergency();
  });

  it("join each field's weather pip onto its symbol by ident, from the map's state", () => {
    const { map, set } = fakeMap(["airports"]);
    setAirportWeather(
      map,
      new Map([
        ["KORD", "#1a7f37"],
        ["KDLH", "#b3261e"],
      ]),
    );
    expect(set.state.get("airportWeather")).toEqual({ KORD: "#1a7f37", KDLH: "#b3261e" });
    const airports = overlayStyle(TILES, ORIGIN).layers.marks!.find((l) => l.id === "airports") as SymbolLayerSpecification;
    expect(JSON.stringify(airports.layout!["icon-image"])).toContain(JSON.stringify(["global-state", "airportWeather"]));
  });
});

describe("a tapped tile feature", () => {
  it("is the volume the airspace card reads", () => {
    const shelf = volumeOfTile({ properties: { class: "B", name: "CHICAGO CLASS B", floor_ft: 3000, ceiling_ft: 10000, number: 7 } });
    expect(shelf).toMatchObject({
      id: "tile-7",
      airspace_class: "B",
      floor_ft: 3000,
      floor_sfc: false,
      ceiling_ft: 10000,
      ceiling_excluded: false,
    });
    // The surface: 0 ft, which the tiles keep.
    const surface = volumeOfTile({ properties: { class: "C", floor_ft: 0, ceiling_ft: 4800 } });
    expect(surface.floor_sfc).toBe(true);
    // A Class D under a Class B shelf: up to but not including (TNI).
    const d = volumeOfTile({ properties: { class: "D", floor_ft: 0, ceiling_ft: 2500, ceiling_excluded: true, hours_code: "NOTAM" } });
    expect(d.ceiling_excluded).toBe(true);
    expect(d.hours_code).toBe("NOTAM");
  });

  it("is the VOR the card reads, its remarks a line each", () => {
    const vor = vorOfTile({
      properties: {
        ident: "GCO",
        name: "GLACIER",
        kind: "VORTAC",
        freq: "108.25",
        mag_var: -3,
        restricted: true,
        remarks: "VOR unusable 072-090\nDME unusable",
      },
      geometry: { type: "Point", coordinates: [-88.1, 42.4] },
    } as never);
    expect(vor).toMatchObject({ ident: "GCO", kind: "VORTAC", lat: 42.4, lon: -88.1, freq: "108.25", mag_var: -3, restricted: true });
    expect(vor.remarks).toEqual(["VOR unusable 072-090", "DME unusable"]);
  });
});
