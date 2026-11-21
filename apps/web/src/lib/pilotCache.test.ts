import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/client";
import type { Pilot } from "./api/types";
import { PILOT_CACHE, PLANNER_CACHES, forgetPilotCache, forgetPlannerAnswers, signedInPilot } from "./pilotCache";

function stubCaches(held: string[] = []) {
  const deleted: string[] = [];
  vi.stubGlobal("caches", {
    delete: async (name: string) => (deleted.push(name), true),
    has: async (name: string) => held.includes(name),
  });
  return deleted;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the pilot's cached copies", () => {
  it("are forgotten when the server says nobody is signed in", async () => {
    const deleted = stubCaches();
    vi.spyOn(api, "me").mockResolvedValue(null);
    await expect(signedInPilot()).resolves.toBeNull();
    expect(deleted).toEqual([PILOT_CACHE]);
  });

  it("take the planner's answers at the last pilot's points with them when a session lapses", async () => {
    // The deep security review of 2026-11-21: only Log Out forgot them.
    const deleted = stubCaches([PILOT_CACHE, ...PLANNER_CACHES]);
    vi.spyOn(api, "me").mockResolvedValue(null);
    await signedInPilot();
    expect(deleted).toEqual([PILOT_CACHE, ...PLANNER_CACHES]);
  });

  it("leave a page that was never signed in its answers for flying offline", async () => {
    const deleted = stubCaches(["planner-api"]);
    vi.spyOn(api, "me").mockResolvedValue(null);
    await signedInPilot();
    expect(deleted).toEqual([PILOT_CACHE]);
  });

  it("are kept while the pilot is signed in", async () => {
    const deleted = stubCaches();
    vi.spyOn(api, "me").mockResolvedValue({ email: "p@example.com" } as Pilot);
    await expect(signedInPilot()).resolves.toMatchObject({ email: "p@example.com" });
    expect(deleted).toEqual([]);
  });

  it("are kept when the check fails, offline or the server down: nobody said signed out", async () => {
    const deleted = stubCaches();
    vi.spyOn(api, "me").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(signedInPilot()).rejects.toThrow();
    expect(deleted).toEqual([]);
  });

  it("are forgotten by name, where the browser has a cache at all", () => {
    const deleted = stubCaches();
    forgetPilotCache();
    expect(deleted).toEqual(["pilot-own"]);
  });

  it("empties the planner's answers with a point in them, the steady data kept", () => {
    const deleted = stubCaches();
    forgetPlannerAnswers();
    expect(deleted).toEqual([...PLANNER_CACHES]);
    expect(deleted).not.toContain("planner-steady");
  });
});
