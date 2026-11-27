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
 * KEPT tiles, the least lately used let go first. Where Cache Storage is not
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
const prefixOf = (archive: string) => `${location.origin}/overlay-tile/${archive}/`;
const keyOf = (archive: string, z: number, x: number, y: number) => `${prefixOf(archive)}${z}/${x}/${y}`;

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

/** Every key the store holds, read once a page (`cache.keys()`) and kept as
 *  tiles are kept and let go: a tile not in it is a miss at once, where each
 *  miss waited on a Cache Storage match, a disk read, before its fetch. */
let known: Promise<Set<string>> | null = null;
function knownKeys(cache: Cache): Promise<Set<string>> {
  known ??= cache.keys().then(
    (keys) => new Set(keys.map((k) => k.url)),
    () => new Set<string>(),
  );
  return known;
}

/** The archive whose tiles the store holds now; any other's go. */
let current: string | null = null;
let sinceTrim = 0;
/** The tiles put to the end of the store's order this page, once each. */
const refreshed = new Set<string>();

/** A kept tile's bytes (none for a tile the archive has not: an empty one,
 *  kept as such, so the ocean's and the borders' tiles ask the archive's
 *  directories nothing again), or undefined where none is kept. A hit is
 *  put again, once a page, so the store lets go the tiles least lately
 *  used rather than the first kept (Cache Storage lists its keys as they
 *  were put, a put again at the end). */
export async function keptTile(archive: string, z: number, x: number, y: number): Promise<Uint8Array | undefined> {
  const cache = await store();
  if (!cache) return undefined;
  const key = keyOf(archive, z, x, y);
  try {
    if (!(await knownKeys(cache)).has(key)) return undefined;
    const hit = await cache.match(key);
    if (!hit) return undefined;
    const data = new Uint8Array(await hit.arrayBuffer());
    if (!refreshed.has(key)) {
      refreshed.add(key);
      void cache.put(key, tileResponse(data)).catch(() => {
        /* kept where it was in the order */
      });
    }
    return data;
  } catch {
    return undefined;
  }
}

const tileResponse = (data: Uint8Array) =>
  new Response(data.slice(), { headers: { "Content-Type": "application/vnd.mapbox-vector-tile" } });

/** A tile's bytes kept, and the store kept to KEPT tiles of this archive:
 *  the first trim of a page when the main thread is idle, as it reads every
 *  key while the map's first tiles are coming in. */
export async function keepTile(archive: string, z: number, x: number, y: number, data: Uint8Array): Promise<void> {
  const cache = await store();
  if (!cache) return;
  const key = keyOf(archive, z, x, y);
  try {
    await cache.put(key, tileResponse(data));
    (await knownKeys(cache)).add(key);
    refreshed.add(key);
    if (current !== archive || ++sinceTrim >= TRIM_EVERY) {
      const fresh = current !== archive;
      current = archive;
      sinceTrim = 0;
      if (fresh) whenIdle(() => void trim(cache, archive, true).catch(() => {}));
      else await trim(cache, archive, false);
    }
  } catch {
    /* full or refused: the tile comes from the archive next time */
  }
}

/** `run` when the main thread is idle (within a second), or soon where the
 *  browser has no requestIdleCallback (Safari before 18.4). */
function whenIdle(run: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1000 });
  else setTimeout(run, 200);
}

/** Another archive's tiles let go (once an archive is new), then the
 *  least lately used kept past KEPT (keptTile's put again), each key
 *  matched as the plain string it is. */
async function trim(cache: Cache, archive: string, fresh: boolean) {
  const keys = await cache.keys();
  const mine = prefixOf(archive);
  const others = fresh ? keys.filter((k) => !k.url.startsWith(mine)) : [];
  const ours = keys.filter((k) => k.url.startsWith(mine));
  const over = ours.slice(0, Math.max(0, ours.length - KEPT));
  const gone = [...others, ...over];
  const kept = await knownKeys(cache);
  for (const k of gone) kept.delete(k.url);
  await Promise.all(gone.map((k) => cache.delete(k)));
}
