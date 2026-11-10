import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import { flushPendingDeletes, holdDelete, releaseDelete } from "./pendingDeletes";

const KEY = "wingtip.pendingDeletes";
const kept = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as { kind: string; id: number }[];

describe("a delete whose Undo is still up", () => {
  afterEach(async () => {
    // Whatever a test left, let go.
    await flushPendingDeletes({ flight: () => Promise.resolve() });
  });

  it("is kept in the browser until it is sent or undone, so a closed tab does not lose it", () => {
    holdDelete("flight", 7);
    holdDelete("flight", 9);
    holdDelete("flight", 7);
    expect(kept()).toEqual([
      { kind: "flight", id: 9 },
      { kind: "flight", id: 7 },
    ]);
    releaseDelete("flight", 9);
    expect(kept()).toEqual([{ kind: "flight", id: 7 }]);
  });

  it("is sent at the next load; one the server has no more is let go, one it could not take yet kept", async () => {
    holdDelete("flight", 1);
    holdDelete("flight", 2);
    holdDelete("flight", 3);
    holdDelete("flight", 4);
    const send = vi.fn(async (id: number) => {
      if (id === 2) throw new ApiError("Not found", 404);
      if (id === 3) throw new ApiError("Sign in", 401);
      if (id === 4) throw new TypeError("Failed to fetch");
    });
    expect(await flushPendingDeletes({ flight: send })).toBe(2);
    expect(send.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4]);
    expect(kept()).toEqual([
      { kind: "flight", id: 3 },
      { kind: "flight", id: 4 },
    ]);
  });
});
