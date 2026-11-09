import { afterEach, describe, expect, it, vi } from "vitest";

// Storage stubbed before the setting is first read (keptStore reads it as
// the store is made), as a browser with nothing kept has it.
async function setting() {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  return import("./glideRingSetting");
}

afterEach(() => vi.unstubAllGlobals());

describe("the glide ring's switch", () => {
  it("is off by default", async () => {
    const { useGlideRingSetting } = await setting();
    expect(useGlideRingSetting.getState().value).toBe(false);
  });

  it("says why it cannot be turned on", async () => {
    const { glideRingBlocked } = await setting();
    expect(glideRingBlocked(false, null, null)).toBe("Pick an airplane");
    expect(glideRingBlocked(true, "N123AB", null)).toBe("No glide ratio for N123AB");
    expect(glideRingBlocked(true, null, null)).toBe("No glide ratio for this airplane");
    expect(glideRingBlocked(true, "N123AB", 9)).toBeNull();
  });
});
