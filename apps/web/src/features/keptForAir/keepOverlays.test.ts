import { afterEach, describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { keepOverlayArchive } from "./keepOverlays";
import { overlayTilesQuery } from "../../lib/queryClient";

/** A client that knows the cycle's archive already. */
function client(bytes = 120e6) {
  const c = new QueryClient();
  c.setQueryData(overlayTilesQuery.queryKey, { name: "2026-10-29-v4", bytes } as never);
  return c;
}

function stub({ kept = false, free = 1e9 } = {}) {
  const fetched: string[] = [];
  vi.stubGlobal("caches", { open: async () => ({ match: async () => (kept ? new Response("x") : undefined) }) });
  vi.stubGlobal("navigator", { storage: { estimate: async () => ({ quota: free, usage: 0 }) } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return new Response(new Uint8Array(1000));
    }),
  );
  return fetched;
}

afterEach(() => vi.unstubAllGlobals());

describe("the map's overlays kept for the air", () => {
  test("the archive fetched whole, once, for the worker to keep and cut ranges from", async () => {
    const fetched = stub();
    expect(await keepOverlayArchive(client())).toBe("kept");
    expect(fetched).toEqual(["/api/planner/overlay-tiles/2026-10-29-v4.pmtiles"]);
  });

  test("not fetched again when kept, nor where the browser has no room for it twice", async () => {
    expect(await keepOverlayArchive(client())).toBe("failed");
    stub({ kept: true });
    expect(await keepOverlayArchive(client())).toBe("already");
    const fetched = stub({ free: 200e6 });
    expect(await keepOverlayArchive(client())).toBe("no-room");
    expect(fetched).toEqual([]);
  });
});
