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
  crosswind_kt: 25,
  crosswind_over: false,
  needed_ft: null,
  length_ft: null,
  short: false,
  close: false,
  unknown: true,
  beyond: false,
  temp_assumed: false,
  tailwind_kt: 0,
  finding: "unknown",
  fit: null,
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
    const c = endChoice(runway, end, "05", () => fit({ crosswind_over: true, finding: "caution", fit: "crosswind" }));
    expect(c.note).toBe("Crosswind 25 kt");
    expect(c.fit).toBe("crosswind");
    expect(c.ring).toContain("ring-caution");
  });

  it("a tailwind and into the wind are said before a crosswind", () => {
    expect(endChoice(runway, end, "05", () => fit({ tailwind_kt: 10, finding: "caution", fit: "tailwind" })).note).toBe("Tailwind 10 kt");
    expect(endChoice(runway, end, "14", () => fit({ crosswind_kt: 0 })).note).toBe("Into the wind");
    // Into the wind with the wind across it too, both said: a field of one
    // runway, its windward end 25 across in the gusts.
    expect(endChoice(runway, end, "14", () => fit({})).note).toBe("Into the wind · Crosswind 25 kt");
  });

  it("no crosswind, nothing said", () => {
    expect(endChoice(runway, end, "05", () => fit({ crosswind_kt: 0 })).note).toBeNull();
  });

  // Which fit leads is the engine's (runway::fit, worst first, asked in
  // fixtures/rules/runwayFit.json); the chip says what it is told.
  it("rings and notes the engine's fit: red too short, amber for a caution", () => {
    const all = { short: true, crosswind_over: true, tailwind_kt: 10, close: true };
    const short = endChoice(runway, end, "05", () => fit({ ...all, finding: "stop", fit: "short" }));
    expect([short.fit, short.note, short.ring]).toEqual(["short", "Too short today", "ring-2 ring-destructive"]);
    const close = endChoice(runway, end, "05", () => fit({ close: true, crosswind_kt: 0, finding: "caution", fit: "close" }));
    expect([close.fit, close.note, close.ring]).toEqual(["close", "Little to spare", "ring-2 ring-caution"]);
    const beyond = endChoice(runway, end, "05", () => fit({ beyond: true, crosswind_kt: 0, finding: "caution", fit: "beyond" }));
    expect([beyond.fit, beyond.note, beyond.ring]).toEqual(["beyond", "Past the POH's tables", "ring-2 ring-caution"]);
    // No temperature reported: a standard day's distances, said (round 7's N6).
    const assumed = endChoice(runway, end, "05", () =>
      fit({ temp_assumed: true, unknown: false, crosswind_kt: 0, finding: "caution", fit: "standard_day" }),
    );
    expect([assumed.fit, assumed.note, assumed.ring]).toEqual(["standard_day", "Assumes a standard day", "ring-2 ring-caution"]);
    expect(assumed.detail).toBe(", distances assume a standard day, no temperature reported");
    // Its words say all that holds, after its number.
    expect(short.words).toBe(`Runway 14${short.detail}`);
    expect(short.detail).toContain("tailwind 10 knots");
    expect(short.detail).toContain("too short today");
  });
});
