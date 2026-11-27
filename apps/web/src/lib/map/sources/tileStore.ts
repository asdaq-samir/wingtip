/**
 * The overlay archive's tiles kept between visits, each tile's bytes by its
 * archive and z/x/y in Cache Storage (overlayTiles' protocol reads through
 * it). The service worker keeps the archive only whole (Keep for the Air):
 * the map reads it in byte ranges, and a 206 answer is never kept (the
 * Cache API holds no partial answer), so every visit fetched every overlay
 * tile again over the network, and Safari kept none of them in its HTTP
 * cache either (the map speed audit, 2026-11-27).
 *
 * The archive's name carries its cycle, its version and its hash
 * (wingtip.vector_tiles, `2026-10-29-v3-0badf00d`), so a tile is kept by
 * name and a new archive is never served an old one's tile; another
 * archive's tiles are let go as the first of a new one is kept. At most
 * KEPT tiles, the first kept the first let go. Where Cache Storage is not
 * to be had (an insecure page, a private window that refuses it) the tiles
 * come from the archive as before.
 */

const CACHE = "overlay-tiles";
/** Some 20 to 60 MB at the archive's few tens of KB a tile: a few dozen
 *  views of the country's busiest airspace. */
const KEPT = 1500;
/** Kept tiles counted again after this many more are kept. */
const TRIM_EVERY = 100;

/** A tile's key: a same-origin address never fetched, only matched. */
const keyOf = (archive: string, z: number, x: number, y: number) => `${location.origin}/overlay-tile/${archive}/${z}/${x}/${y}`;

let opened: Promise<Cache | null> | null = null;
function store(): Promise<Cache | null> {
  opened ??= (async () => {
    try {
      return typeof caches === "undefined" ? null : await caches.open(CACHE);
    } catch {
      return null;
    }
  })();
  return opened;
}

/** The archive whose tiles the store holds now; any other's go. */
let current: string | null = null;
let sinceTrim = 0;

/** A kept tile's bytes, or undefined where none is kept. */
export async function keptTile(archive: string, z: number, x: number, y: number): Promise<Uint8Array | undefined> {
  const cache = await store();
  if (!cache) return undefined;
  try {
    const hit = await cache.match(keyOf(archive, z, x, y));
    return hit ? new Uint8Array(await hit.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

/** A tile's bytes kept, and the store kept to KEPT tiles of this archive. */
export async function keepTile(archive: string, z: number, x: number, y: number, data: Uint8Array): Promise<void> {
  const cache = await store();
  if (!cache) return;
  try {
    await cache.put(
      keyOf(archive, z, x, y),
      new Response(data.slice(), { headers: { "Content-Type": "application/vnd.mapbox-vector-tile" } }),
    );
    if (current !== archive || ++sinceTrim >= TRIM_EVERY) {
      const fresh = current !== archive;
      current = archive;
      sinceTrim = 0;
      await trim(cache, archive, fresh);
    }
  } catch {
    /* full or refused: the tile comes from the archive next time */
  }
}

/** Another archive's tiles let go (once an archive is new), then the
 *  oldest kept past KEPT: Cache Storage lists its keys as they were put. */
async function trim(cache: Cache, archive: string, fresh: boolean) {
  const keys = await cache.keys();
  const mine = `/overlay-tile/${archive}/`;
  const others = fresh ? keys.filter((k) => !new URL(k.url).pathname.startsWith(mine)) : [];
  const ours = keys.filter((k) => new URL(k.url).pathname.startsWith(mine));
  const over = ours.slice(0, Math.max(0, ours.length - KEPT));
  await Promise.all([...others, ...over].map((k) => cache.delete(k)));
}
