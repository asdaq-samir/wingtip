import { PMTiles, Protocol } from "pmtiles";
import type { OverlayTiles } from "../../api/types";
import { tileOf } from "../tileMath";

/**
 * The map's FAA overlays as vector tiles, for a MapLibre map: the cycle's
 * airspace and its labels, special-use areas, airports, navaids, fixes and runways in
 * one PMTiles archive the planner builds once a cycle
 * (wingtip.vector_tiles) and serves in byte ranges
 * (/api/overlay-tiles/{name}.pmtiles), read here by protomaps' own
 * `pmtiles` library -- stock, nothing hand-rolled but the small cache of
 * tiles fetched ahead (prefetchRing). A map registers the protocol once,
 * asks `api.overlayTiles()` for the cycle's archive, and adds
 * `overlaySource(tiles)` as a vector source in its first style
 * (lib/map/gl/glOverlays); its layers then draw from the source layers in
 * OVERLAY_LAYERS, by the fields services/jobs/README.md lists.
 */

/** The archive's source layers (wingtip.vector_tiles.LAYERS). */
export const OVERLAY_LAYERS = [
  "airspace",
  "airspace_labels",
  "special_use",
  "special_use_labels",
  "airports",
  "navaids",
  "fixes",
  "runways",
] as const;

/** MapLibre's addProtocol, as much of it as this needs: maplibre-gl itself
 *  is the map's import, not this module's. The loader is pmtiles' own
 *  (its tilev4), whose answer MapLibre's types name differently. */
interface ProtocolHost {
  addProtocol(name: string, loader: never): void;
}

// No metadata: the source names its own zooms and credit, so the
// archive's JSON metadata, one more range request before the first
// tile, is never asked for.
const protocol = new Protocol({ metadata: false });
const registered = new WeakSet<ProtocolHost>();

/** The tiles fetched ahead of the map asking (prefetchRing), by their
 *  pmtiles:// address, each handed over once and then let go; at most
 *  PREFETCH_KEPT, the oldest dropped first. */
const ahead = new Map<string, Promise<Uint8Array | null>>();
const PREFETCH_KEPT = 160;
/** Every tile fetched ahead already, so a rest after a rest asks only for
 *  the new ones; a few views' worth, then forgotten. */
const asked = new Set<string>();
const ASKED_KEPT = 4000;

/** The protocol's tile, from the tiles fetched ahead where it is one. */
const tile: Protocol["tilev4"] = async (params, abort) => {
  const early = ahead.get(params.url);
  if (early) {
    ahead.delete(params.url);
    const data = await early;
    if (data) return { data, cacheControl: undefined, expires: undefined };
  }
  return protocol.tilev4(params, abort);
};

/** The `pmtiles://` protocol added to a MapLibre once, however many maps
 *  are made: one Protocol, so every map shares the archives' headers and
 *  directories it has already read. */
export function registerOverlayProtocol(maplibre: ProtocolHost): void {
  if (registered.has(maplibre)) return;
  maplibre.addProtocol("pmtiles", tile as never);
  registered.add(maplibre);
}

/** The archive's address through the gateway (PlannerProxyController
 *  passes the Range on): absolute, as the pmtiles protocol fetches it. */
function overlayArchiveUrl(tiles: Pick<OverlayTiles, "name">, origin: string = location.origin): string {
  return `${origin}/api/planner/overlay-tiles/${tiles.name}.pmtiles`;
}

/** The archive's reader, the protocol's own, made once an address. */
function archiveOf(tiles: Pick<OverlayTiles, "name">, origin?: string): PMTiles {
  const url = overlayArchiveUrl(tiles, origin);
  let archive = protocol.get(url);
  if (!archive) {
    archive = new PMTiles(url);
    protocol.add(archive);
  }
  return archive;
}

/** The archive's header and root directory -- its first 16 KB, one range
 *  request -- asked for now, as the page loads (main.tsx), so the map's
 *  first tile goes straight to its bytes rather than waiting on them. */
export function warmOverlayArchive(tiles: Pick<OverlayTiles, "name">, origin?: string): void {
  void archiveOf(tiles, origin)
    .getHeader()
    .catch(() => {
      /* the map asks again, and draws without it */
    });
}

/** A MapLibre vector source of the cycle's archive: its tiles' address
 *  itself rather than a TileJSON one, so the map asks for no TileJSON
 *  first. Its zooms are the archive's: past max_zoom MapLibre draws the
 *  deepest tiles larger, within the archive's tolerance_m of the FAA's
 *  lines. */
export function overlaySource(tiles: OverlayTiles, origin?: string) {
  return {
    type: "vector" as const,
    tiles: [`pmtiles://${overlayArchiveUrl(tiles, origin)}/{z}/{x}/{y}`],
    minzoom: tiles.min_zoom,
    maxzoom: tiles.max_zoom,
    attribution: `FAA NASR, cycle ${tiles.cycle}`,
  };
}

/** The XYZ tiles a box covers at zoom z: [x0, y0, x1, y1], inclusive. */
export function tileRange(box: { west: number; south: number; east: number; north: number }, z: number): [number, number, number, number] {
  const n = 2 ** z;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  const nw = tileOf(box.north, box.west, z);
  const se = tileOf(box.south, box.east, z);
  return [clamp(nw.x), clamp(nw.y), clamp(se.x), clamp(se.y)];
}

/** The tiles one ring outside a range, within the world. */
export function ringAround([x0, y0, x1, y1]: [number, number, number, number], z: number): [number, number][] {
  const n = 2 ** z;
  const ring: [number, number][] = [];
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (!inside && x >= 0 && y >= 0 && x < n && y < n) ring.push([x, y]);
    }
  }
  return ring;
}

/**
 * The overlay tiles one ring outside the view, at the zoom the map draws
 * now (a vector source's: the whole level under the map's, within the
 * archive's zooms), fetched while the map is at rest so a pan's first
 * frame has them. Each is kept until the map asks for it (`tile`), and a
 * tile already fetched or being fetched is not asked for twice.
 */
export function prefetchRing(
  tiles: OverlayTiles,
  box: { west: number; south: number; east: number; north: number },
  mapZoom: number,
  origin?: string,
): void {
  const z = Math.max(tiles.min_zoom, Math.min(tiles.max_zoom, Math.floor(mapZoom)));
  const archive = archiveOf(tiles, origin);
  const base = `pmtiles://${overlayArchiveUrl(tiles, origin)}`;
  for (const [x, y] of ringAround(tileRange(box, z), z)) {
    const url = `${base}/${z}/${x}/${y}`;
    if (asked.has(url)) continue;
    if (asked.size > ASKED_KEPT) asked.clear();
    asked.add(url);
    ahead.set(
      url,
      archive
        .getZxy(z, x, y)
        .then((r) => (r ? new Uint8Array(r.data) : new Uint8Array()))
        .catch(() => null),
    );
    while (ahead.size > PREFETCH_KEPT) ahead.delete(ahead.keys().next().value!);
  }
}
