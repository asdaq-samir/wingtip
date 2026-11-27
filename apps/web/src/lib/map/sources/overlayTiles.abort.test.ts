import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OverlayTiles } from "../../api/types";

/** Each archive read the protocol asked for: its tile and the signal it
 *  was given, and its answer to give. */
const reads = vi.hoisted(() => [] as { at: string; signal: AbortSignal; answer: (bytes: Uint8Array) => void }[]);

// The archive's reader, PMTiles' own, standing in for the network: each
// getZxy waits until the test answers it.
vi.mock("pmtiles", () => {
  class PMTiles {
    constructor(readonly url: string) {}
    getZxy(z: number, x: number, y: number, signal: AbortSignal) {
      return new Promise<{ data: ArrayBuffer }>((resolve, reject) => {
        // As fetch does, a stopped read fails.
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        reads.push({ at: `${z}/${x}/${y}`, signal, answer: (bytes) => resolve({ data: bytes.buffer as ArrayBuffer }) });
      });
    }
    getHeader() {
      return Promise.resolve({});
    }
  }
  class Protocol {
    private archives = new Map<string, PMTiles>();
    get(url: string) {
      return this.archives.get(url);
    }
    add(p: PMTiles) {
      this.archives.set(p.url, p);
    }
    tilev4() {
      return Promise.reject(new Error("not a tile"));
    }
  }
  return { PMTiles, Protocol };
});
// Nothing kept from an earlier visit, and nothing written.
vi.mock("./tileStore", () => ({ keptTile: async () => undefined, keepTile: async () => {} }));

const { OVERLAY_LAYERS, prefetchRing, registerOverlayProtocol } = await import("./overlayTiles");

const TILES: OverlayTiles = {
  cycle: "2026-10-29",
  name: "2026-10-29-v3-abort",
  version: 3,
  bytes: 1,
  built_at: 1,
  min_zoom: 4,
  max_zoom: 12,
  tolerance_m: 4.1,
  layers: OVERLAY_LAYERS.map((name) => ({ name, features: 1 })),
};
const ORIGIN = "https://wingtip.test";
const URL_OF = (zxy: string) => `pmtiles://${ORIGIN}/api/planner/overlay-tiles/${TILES.name}.pmtiles/${zxy}`;

/** The protocol's loader as MapLibre calls it, from a fake MapLibre. */
type Loader = (params: { url: string; type: string }, abort: AbortController) => Promise<{ data: Uint8Array }>;
let load: Loader;
beforeEach(() => {
  const host = { addProtocol: vi.fn() };
  registerOverlayProtocol(host);
  load = host.addProtocol.mock.calls[0]![1] as Loader;
});
const ask = (zxy: string) => {
  const abort = new AbortController();
  const answer = load({ url: URL_OF(zxy), type: "arrayBuffer" }, abort);
  answer.catch(() => {});
  return { abort, answer };
};
/** The archive read of a tile, once the kept tiles have been looked in. */
const readOf = (zxy: string) => vi.waitFor(() => reads.find((r) => r.at === zxy) ?? Promise.reject(new Error(`no read of ${zxy}`)));

describe("an overlay tile the map stops asking for", () => {
  it("stops the archive's fetch only once every request waiting on it is aborted", async () => {
    const one = ask("9/131/190"),
      two = ask("9/131/190");
    const read = await readOf("9/131/190");
    // One read for both: every source reading the archive has the one fetch.
    expect(reads.filter((r) => r.at === "9/131/190")).toHaveLength(1);
    one.abort.abort();
    expect(read.signal.aborted).toBe(false);
    two.abort.abort();
    expect(read.signal.aborted).toBe(true);
    await expect(two.answer).rejects.toThrow();
  });

  it("keeps fetching a tile a fetch ahead wants, whatever the map's requests do", async () => {
    // The ring round Chicago at zoom 8 (tileRange 65, 94): 64/93 is in it.
    prefetchRing(TILES, { west: -87.9, south: 41.8, east: -87.6, north: 42.1 }, 8.2, ORIGIN);
    const read = await readOf("8/64/93");
    const map = ask("8/64/93");
    map.abort.abort();
    expect(read.signal.aborted).toBe(false);
  });

  it("answers each request a copy of the bytes, and an abort after the answer stops nothing", async () => {
    const first = ask("10/262/380");
    const read = await readOf("10/262/380");
    read.answer(new Uint8Array([1, 2, 3]));
    const got = await first.answer;
    expect([...got.data]).toEqual([1, 2, 3]);
    // Later requests, from the tiles read lately, then their abort.
    const again = ask("10/262/380");
    expect([...(await again.answer).data]).toEqual([1, 2, 3]);
    expect(again.answer).not.toBe(first.answer);
    again.abort.abort();
    expect(read.signal.aborted).toBe(false);
  });
});
