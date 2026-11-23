import { describe, expect, it, vi } from "vitest";
import type { OverlayTiles } from "../../api/types";
import { OVERLAY_LAYERS, overlaySource, prefetchRing, registerOverlayProtocol, ringAround, tileRange } from "./overlayTiles";

const TILES: OverlayTiles = {
  cycle: "2026-10-29",
  name: "2026-10-29-v1-0badf00d",
  version: 1,
  bytes: 1,
  built_at: 1,
  min_zoom: 4,
  max_zoom: 12,
  tolerance_m: 4.1,
  layers: OVERLAY_LAYERS.map((name) => ({ name, features: 1 })),
};

describe("the overlay tiles", () => {
  it("are a vector source of the cycle's archive's own tiles through the gateway, at its zooms, with no TileJSON to ask for first", () => {
    expect(overlaySource(TILES, "https://wingtip.example")).toEqual({
      type: "vector",
      tiles: ["pmtiles://https://wingtip.example/api/planner/overlay-tiles/2026-10-29-v1-0badf00d.pmtiles/{z}/{x}/{y}"],
      minzoom: 4,
      maxzoom: 12,
      attribution: "FAA NASR, cycle 2026-10-29",
    });
  });

  it("add the pmtiles protocol to a MapLibre once", () => {
    const maplibre = { addProtocol: vi.fn() };
    registerOverlayProtocol(maplibre);
    registerOverlayProtocol(maplibre);
    expect(maplibre.addProtocol).toHaveBeenCalledOnce();
    expect(maplibre.addProtocol.mock.calls[0]![0]).toBe("pmtiles");
  });

  it("find the tiles a view covers, as XYZ tiles are numbered", () => {
    // Chicago at zoom 8: x = floor((-87.9 + 180) / 360 * 256) = 65; y from
    // the web Mercator of 42.1 N, 94, to 41.8 N, 95.
    expect(tileRange({ west: -87.9, south: 41.8, east: -87.6, north: 42.1 }, 8)).toEqual([65, 94, 65, 95]);
    // The whole world's one tile at zoom 0, however far the box reaches.
    expect(tileRange({ west: -180, south: -89, east: 180, north: 89 }, 0)).toEqual([0, 0, 0, 0]);
  });

  it("prefetch the ring one tile outside the view, within the world", () => {
    expect(ringAround([5, 5, 6, 5], 4)).toHaveLength(4 * 3 - 2);
    expect(ringAround([5, 5, 6, 5], 4)).not.toContainEqual([5, 5]);
    // At the world's corner the ring stops at its edge.
    expect(ringAround([0, 0, 0, 0], 2).sort()).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("fetch no ring ahead farther out than the archive's first zoom, where the source asks for no tile", () => {
    // The country's first view (app zoom 4, MapLibre's 3) is under the
    // archive's 4: the ring was the archive's zoom 4 round the country.
    const fetched = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    prefetchRing(TILES, { west: -125, south: 25, east: -67, north: 49 }, 3.4, "https://wingtip.example");
    expect(fetched).not.toHaveBeenCalled();
    prefetchRing(TILES, { west: -88, south: 41.8, east: -87.6, north: 42.1 }, 8.2, "https://wingtip.example");
    expect(fetched).toHaveBeenCalled();
    fetched.mockRestore();
  });
});
