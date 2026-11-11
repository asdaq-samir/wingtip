import { describe, expect, test, vi } from "vitest";
import { newerBuild, recoverChunk, type RecoverWith } from "./chunkRecovery";

const OLD = "/app/assets/index-old.js";
function withIndex(index: string | null, storage = new Map<string, string>(), online = true) {
  const reload = vi.fn<() => void>();
  const with_: RecoverWith = {
    fetchIndex: async () => index,
    entry: `https://example.test${OLD}`,
    update: async () => {},
    reload,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
    online,
    now: 1_000_000,
  };
  return { ...with_, reload };
}

describe("a chunk that would not load", () => {
  test("a newer build served: the page loaded again, once, and not in a loop", async () => {
    const storage = new Map<string, string>();
    const first = withIndex('<script src="/app/assets/index-new.js">', storage);
    expect(await recoverChunk(first)).toBe("reloaded");
    expect(first.reload).toHaveBeenCalledOnce();
    // The reloaded page fails again within the minute: no second reload, the screen says a newer version is ready.
    const again = withIndex('<script src="/app/assets/index-new.js">', storage);
    expect(await recoverChunk(again)).toBe("newer");
    expect(again.reload).not.toHaveBeenCalled();
  });

  test("the same build served: no reload, the part said not loaded; no connection said so", async () => {
    const same = withIndex(`<script src="${OLD}">`);
    expect(await recoverChunk(same)).toBe("failed");
    expect(same.reload).not.toHaveBeenCalled();
    expect(await recoverChunk(withIndex(null))).toBe("offline");
    expect(await recoverChunk(withIndex("x", new Map(), false))).toBe("offline");
  });

  test("a newer build is an index that no longer names this page's entry", () => {
    expect(newerBuild(`<script src="${OLD}">`, OLD)).toBe(false);
    expect(newerBuild("<script src='/app/assets/index-new.js'>", OLD)).toBe(true);
    expect(newerBuild("anything", null)).toBe(false);
  });
});
