import { describe, expect, it } from "vitest";
import { allPads, flightWords, newPad, removePad, sameFlight, savePad, type PadStore } from "./padStore";
import { TEMPLATES, templateOf } from "./templates";

/** A store in memory, as the device's IndexedDB would keep it. */
function memory(): PadStore {
  const kept = new Map<string, unknown>();
  return {
    get: async <T,>(k: string) => kept.get(k) as T | undefined,
    set: async (k, v) => void kept.set(k, structuredClone(v)),
    del: async (k) => void kept.delete(k),
  };
}

const OSH = { dep: "C81", dest: "KOSH" };

describe("the scratchpad's pages on the device", () => {
  it("keeps each page, newest first, and takes one away", async () => {
    const s = memory();
    const atis = newPad("atis", OSH, new Date("2026-11-21T14:00:00Z"), "a");
    const craft = newPad("craft", null, new Date("2026-11-21T15:00:00Z"), "b");
    await savePad(s, atis);
    await savePad(s, craft);
    await savePad(s, { ...atis, fields: { information: "Kilo" } });
    expect((await allPads(s)).map((p) => p.id)).toEqual(["b", "a"]);
    expect((await allPads(s))[1]!.fields.information).toBe("Kilo");
    await removePad(s, "b");
    expect((await allPads(s)).map((p) => p.id)).toEqual(["a"]);
  });

  it("ties a page to its flight by the route's ends", () => {
    expect(sameFlight(OSH, { dep: "C81", dest: "KOSH" })).toBe(true);
    expect(sameFlight(OSH, { dep: "C81", dest: "KMSN" })).toBe(false);
    expect(sameFlight(null, OSH)).toBe(false);
    expect(sameFlight({ dep: null, dest: null }, { dep: null, dest: null })).toBe(false);
    expect(flightWords(OSH)).toBe("C81 → KOSH");
    expect(flightWords({ dep: null, dest: "KOSH" })).toBe("KOSH");
    expect(flightWords(null)).toBeNull();
  });
});

describe("the templates", () => {
  it("are a blank page, CRAFT, the ATIS and the takeoff and landing figures", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["blank", "craft", "atis", "takeoff-landing"]);
    expect(templateOf("craft").fields.map((f) => f.label)).toEqual(["Clearance limit", "Route", "Altitude", "Frequency", "Transponder"]);
    expect(templateOf("atis").fields.map((f) => f.key)).toEqual(["information", "wind", "altimeter", "runway", "remarks"]);
    expect(templateOf("blank").fields).toHaveLength(0);
  });
});
