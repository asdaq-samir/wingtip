import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/client";
import type { Pilot } from "./api/types";
import { PILOT_CACHE, forgetPilotCache, signedInPilot } from "./pilotCache";

function stubCaches() {
  const deleted: string[] = [];
  vi.stubGlobal("caches", { delete: async (name: string) => (deleted.push(name), true) });
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
});
