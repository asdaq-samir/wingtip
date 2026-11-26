import { describe, expect, it } from "vitest";
import type { Runway } from "../../lib/api/types";
import type { RunwayEnd } from "../plan";
import { endChoice } from "./runwayChoice";
import type { EndFit } from "./runwayFit";

// KBUF 14 with the wind 060 at 20 gusting 26: some 25 knots across it in
// the gusts (the planner's own figure, 2026-11-26).
const runway = { ends: "14/32" } as Runway;
const end = { ident: "14", heading_true_deg: 127 } as RunwayEnd;
const fit = (over: Partial<EndFit>): EndFit => ({
  crosswindKt: 25,
  crosswindOver: false,
  neededFt: null,
  lengthFt: null,
  short: false,
  close: false,
  unknown: true,
  beyond: false,
  tailwindKt: 0,
  ...over,
});

describe("a runway end's note in its menu", () => {
  it("says the crosswind as a figure, grey, where the airplane has no demonstrated one to judge it by", () => {
    const c = endChoice(runway, end, "05", () => fit({}));
    expect(c.note).toBe("Crosswind 25 kt");
    expect(c.fit).toBeUndefined();
    expect(c.ring).toBeUndefined();
    expect(c.words).toContain("crosswind 25 knots");
  });

  it("past the demonstrated, a caution with its ring", () => {
    const c = endChoice(runway, end, "05", () => fit({ crosswindOver: true }));
    expect(c.note).toBe("Crosswind 25 kt");
    expect(c.fit).toBe("crosswind");
    expect(c.ring).toContain("ring-caution");
  });

  it("a tailwind and into the wind are said before a crosswind", () => {
    expect(endChoice(runway, end, "05", () => fit({ tailwindKt: 10 })).note).toBe("Tailwind 10 kt");
    expect(endChoice(runway, end, "14", () => fit({ crosswindKt: 0 })).note).toBe("Into the wind");
    // Into the wind with the wind across it too, both said: a field of one
    // runway, its windward end 25 across in the gusts.
    expect(endChoice(runway, end, "14", () => fit({})).note).toBe("Into the wind · Crosswind 25 kt");
  });

  it("no crosswind, nothing said", () => {
    expect(endChoice(runway, end, "05", () => fit({ crosswindKt: 0 })).note).toBeNull();
  });

  it("the worst fit leads its ring and note: too short, then a crosswind past the demonstrated, a tailwind, little to spare", () => {
    const all = { short: true, crosswindOver: true, tailwindKt: 10, close: true };
    const short = endChoice(runway, end, "05", () => fit(all));
    expect([short.fit, short.note, short.ring]).toEqual(["short", "Too short today", "ring-2 ring-destructive"]);
    expect(endChoice(runway, end, "05", () => fit({ ...all, short: false })).fit).toBe("crosswind");
    expect(endChoice(runway, end, "05", () => fit({ ...all, short: false, crosswindOver: false })).fit).toBe("tailwind");
    const close = endChoice(runway, end, "05", () => fit({ close: true, crosswindKt: 0 }));
    expect([close.fit, close.note, close.ring]).toEqual(["close", "Little to spare", "ring-2 ring-caution"]);
    // Its words say all that holds, after its number.
    expect(short.words).toBe(`Runway 14${short.detail}`);
    expect(short.detail).toContain("tailwind 10 knots");
    expect(short.detail).toContain("too short today");
  });
});
