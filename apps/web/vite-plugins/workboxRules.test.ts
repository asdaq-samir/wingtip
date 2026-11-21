import { afterEach, describe, expect, it, vi } from "vitest";
import { CHART_TILES, dropOlderEditions } from "./workboxRules.ts";

const tile = (kind: string, cycle: string, revision: number, xy = "9/131/190") =>
  `https://wingtip.test/api/planner/chart-tile/${kind}/${xy}@2x.png?c=${cycle}&r=${revision}`;
const cdn = (kind: string, cycle: string, revision: number) => `https://tiles.wingtip.test/tiles/${cycle}/${kind}/9/131/190.png?r=${revision}`;

/** A cache holding `addresses`, as the worker's chart-tiles cache would. */
function fakeCaches(addresses: string[]) {
  const kept = new Set(addresses);
  const cache = {
    keys: async () => [...kept].map((url) => ({ url })),
    delete: async (key: { url: string }) => kept.delete(key.url),
  };
  vi.stubGlobal("caches", { open: async () => cache });
  return kept;
}

const kept = (url: string) => dropOlderEditions.cacheDidUpdate({ cacheName: "chart-tiles", request: { url } as Request });

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { __chartEditions?: unknown }).__chartEditions;
});

describe("the chart tiles kept by the worker", () => {
  it("never keeps an opaque answer, only a drawn tile or the planner's empty 204", () => {
    expect(CHART_TILES.options?.cacheableResponse?.statuses).toEqual([200, 204]);
  });

  it("drops a kind's older cycles and revisions as a newer edition's tile is kept, and no other kind's", async () => {
    const left = fakeCaches([
      tile("sec", "09-03-2026", 4),
      tile("sec", "10-29-2026", 5),
      tile("sec", "10-29-2026", 6),
      tile("tac", "09-03-2026", 2),
      cdn("sec", "09-03-2026", 1),
    ]);
    await kept(tile("sec", "10-29-2026", 6, "9/132/190"));
    expect([...left].sort()).toEqual([tile("sec", "10-29-2026", 6), tile("tac", "09-03-2026", 2)].sort());
  });

  it("leaves the newer tiles where a page still on the last cycle's chart keeps one of its own", async () => {
    const left = fakeCaches([tile("sec", "10-29-2026", 6), tile("sec", "09-03-2026", 4)]);
    await kept(tile("sec", "10-29-2026", 6, "9/132/190"));
    await kept(tile("sec", "09-03-2026", 4, "9/132/191"));
    expect(left.has(tile("sec", "10-29-2026", 6))).toBe(true);
  });

  it("reads the cache once for a run of tiles of one edition", async () => {
    fakeCaches([]);
    const open = vi.spyOn(caches, "open");
    await kept(tile("sec", "10-29-2026", 6));
    await kept(tile("sec", "10-29-2026", 6, "9/132/190"));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
