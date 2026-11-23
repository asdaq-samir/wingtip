import { describe, expect, it, vi } from "vitest";
import { isNewer, joinViews } from "./supersede";

describe("the newest live view keeps the say", () => {
  it("is judged by the server's time, then its count, then the view's id", () => {
    expect(isNewer({ createdAt: 2, seq: 1, id: "a" }, { createdAt: 1, seq: 9, id: "b" })).toBe(true);
    expect(isNewer({ createdAt: 1, seq: 1, id: "a" }, { createdAt: 1, seq: 2, id: "b" })).toBe(false);
    expect(isNewer({ createdAt: 1, seq: 1, id: "b" }, { createdAt: 1, seq: 1, id: "a" })).toBe(true);
  });

  it("stands an older view down once a newer one says its key, and back up when it takes a newer answer", async () => {
    const older = vi.fn();
    const newer = vi.fn();
    const a = joinViews("a", "pilot-7", older);
    const b = joinViews("b", "pilot-7", newer);
    a.say({ createdAt: 1, seq: 1 });
    b.say({ createdAt: 2, seq: 2 });
    await vi.waitFor(() => expect(older).toHaveBeenLastCalledWith(true));
    a.say({ createdAt: 3, seq: 3 });
    await vi.waitFor(() => expect(newer).toHaveBeenLastCalledWith(true));
    a.leave();
    b.leave();
  });

  it("hears no view of another channel, and nothing that is not a view's key", async () => {
    const mine = vi.fn();
    const a = joinViews("a", "pilot-7", mine);
    const elsewhere = joinViews("z", "another-connector", vi.fn());
    a.say({ createdAt: 1, seq: 1 });
    elsewhere.say({ createdAt: 9e15, seq: 9 });
    const forged = new BroadcastChannel("wingtip-flight-view:pilot-7");
    forged.postMessage({ id: "x", kind: "hello", createdAt: "9e15", seq: 9 });
    forged.postMessage({ id: "y", kind: "here", createdAt: 5 });
    await new Promise((r) => setTimeout(r, 50));
    expect(mine).not.toHaveBeenCalledWith(true);
    forged.close();
    elsewhere.leave();
    a.leave();
  });
});
