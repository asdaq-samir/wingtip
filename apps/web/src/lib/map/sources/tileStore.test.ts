import { afterEach, describe, expect, it, vi } from "vitest";

/** As much of Cache Storage as the store uses, its keys in put order (a
 *  put again moves a key to the end, as the Cache API's batch put does). */
function fakeCaches() {
  const entries = new Map<string, Uint8Array>();
  const cache = {
    keys: vi.fn(async () => [...entries.keys()].map((url) => ({ url }))),
    match: vi.fn(async (key: string) => (entries.has(key) ? new Response(entries.get(key)!.slice()) : undefined)),
    put: vi.fn(async (key: string, r: Response) => {
      const data = new Uint8Array(await r.arrayBuffer());
      entries.delete(key);
      entries.set(key, data);
    }),
    delete: vi.fn(async (k: { url: string }) => entries.delete(k.url)),
  };
  vi.stubGlobal("caches", { open: async () => cache });
  vi.stubGlobal("location", { origin: ORIGIN });
  return { cache, entries };
}

const ORIGIN = "https://wingtip.test";
const key = (z: number, x: number, y: number) => `${ORIGIN}/overlay-tile/a/${z}/${x}/${y}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the overlay tiles kept between visits", () => {
  it("miss at once a tile never kept, with no Cache Storage match", async () => {
    const { cache } = fakeCaches();
    const { keptTile } = await import("./tileStore");
    expect(await keptTile("a", 8, 65, 94)).toBeUndefined();
    expect(await keptTile("a", 8, 65, 95)).toBeUndefined();
    expect(cache.match).not.toHaveBeenCalled();
    // The keys read once a page.
    expect(cache.keys).toHaveBeenCalledOnce();
  });

  it("keep an empty tile as empty, so the archive is not asked for it again", async () => {
    fakeCaches();
    const { keepTile, keptTile } = await import("./tileStore");
    await keepTile("a", 8, 1, 1, new Uint8Array());
    const kept = await keptTile("a", 8, 1, 1);
    expect(kept).toBeInstanceOf(Uint8Array);
    expect(kept).toHaveLength(0);
  });

  it("put a tile used again at the end of the order, once a page", async () => {
    const { entries } = fakeCaches();
    // Two tiles kept on an earlier visit, the first the oldest.
    entries.set(key(8, 1, 1), new Uint8Array([1]));
    entries.set(key(8, 1, 2), new Uint8Array([2]));
    const { keptTile } = await import("./tileStore");
    expect(await keptTile("a", 8, 1, 1)).toEqual(new Uint8Array([1]));
    await vi.waitFor(() => expect([...entries.keys()].at(-1)).toBe(key(8, 1, 1)));
  });
});
