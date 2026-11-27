import { PMTiles, Protocol } from "pmtiles";
import type { OverlayTiles } from "../../api/types";
import { tileOf } from "../tileMath";
import { keepTile, keptTile } from "./tileStore";

/**
 * The map's FAA overlays as vector tiles, for a MapLibre map: the cycle's
 * airspace and its labels, special-use areas, airports, navaids, fixes and runways in
 * one PMTiles archive the planner builds once a cycle
 * (wingtip.vector_tiles) and serves in byte ranges
 * (/api/overlay-tiles/{name}.pmtiles), read here by protomaps' own
 * `pmtiles` library -- stock, nothing hand-rolled but the tiles kept: in
 * memory as they are fetched (and ahead, prefetchRing), and between visits
 * (tileStore). A map registers the protocol once,
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

/** The tiles fetched lately or ahead of the map asking (prefetchRing), by
 *  their pmtiles:// address, for every source that reads the archive (the
 *  airports' own and the rest, glOverlays) to have from one fetch; at most
 *  RECENT_KEPT, the oldest dropped first. */
const recent = new Map<string, Promise<Uint8Array>>();
const RECENT_KEPT = 200;
/** Every tile fetched ahead already, so a rest after a rest asks only for
 *  the new ones; a few views' worth, then forgotten. */
const asked = new Set<string>();
const ASKED_KEPT = 4000;

const TILE_URL = /^pmtiles:\/\/(.+\/([^/]+)\.pmtiles)\/(\d+)\/(\d+)\/(\d+)$/;

/** A tile's bytes: fetched lately, else kept from an earlier visit
 *  (tileStore), else read from the archive and kept. A tile the archive
 *  lacks is empty, as pmtiles' own protocol answers for vector tiles. */
function fetchTile(url: string): Promise<Uint8Array> | null {
  const got = recent.get(url);
  if (got) return got;
  const m = TILE_URL.exec(url);
  if (!m) return null;
  const [, archiveUrl, name, z, x, y] = m as unknown as [string, string, string, string, string, string];
  const at = [+z, +x, +y] as const;
  const read = (async () => {
    const kept = await keptTile(name, ...at);
    if (kept) return kept;
    const r = await archiveAt(archiveUrl).getZxy(...at);
    const data = r ? new Uint8Array(r.data) : new Uint8Array();
    if (data.length) void keepTile(name, ...at, data);
    return data;
  })();
  recent.set(url, read);
  read.catch(() => recent.delete(url));
  while (recent.size > RECENT_KEPT) recent.delete(recent.keys().next().value!);
  return read;
}

/** The protocol's tile, through fetchTile; each answer a copy, as MapLibre
 *  hands the bytes to its worker. */
const tile: Protocol["tilev4"] = async (params, abort) => {
  const read = params.type === "json" ? null : fetchTile(params.url);
  if (!read) return protocol.tilev4(params, abort);
  const data = await read;
  abort.signal.throwIfAborted();
  return { data: data.slice(), cacheControl: undefined, expires: undefined };
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
  return archiveAt(overlayArchiveUrl(tiles, origin));
}
function archiveAt(url: string): PMTiles {
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
 * tile already fetched or being fetched is not asked for twice. None
 * farther out than the archive's first zoom: there the source asks for no
 * tile, so the ring was the archive's first zoom round the whole country
 * (the map's first view with no position kept), a dozen tiles fetched
 * that nothing drew.
 */
export function prefetchRing(
  tiles: OverlayTiles,
  box: { west: number; south: number; east: number; north: number },
  mapZoom: number,
  origin?: string,
): void {
  if (Math.floor(mapZoom) < tiles.min_zoom) return;
  const z = Math.min(tiles.max_zoom, Math.floor(mapZoom));
  const base = `pmtiles://${overlayArchiveUrl(tiles, origin)}`;
  for (const [x, y] of ringAround(tileRange(box, z), z)) {
    const url = `${base}/${z}/${x}/${y}`;
    if (asked.has(url)) continue;
    if (asked.size > ASKED_KEPT) asked.clear();
    asked.add(url);
    fetchTile(url)?.catch(() => {
      /* the map asks again as it needs the tile */
    });
  }
}
