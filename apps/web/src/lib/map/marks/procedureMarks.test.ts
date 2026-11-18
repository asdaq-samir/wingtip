import { describe, expect, it } from "vitest";
import type { ProcedureFix } from "../../api/types";
import { fixMarks } from "./procedureMarks";

/** POBER of KOSH's ILS RWY 36, at or above 2,700 ft (the FAA's CIFP). */
const POBER = {
  ident: "POBER",
  lat: 43.9,
  lon: -88.56,
  roles: ["FAF"],
  min_ft: 2700,
  max_ft: null,
  missed: false,
} as unknown as ProcedureFix;
const lineTexts = (tag: { id: string } | null) =>
  tag
    ? (JSON.parse(tag.id.slice("proc-tag|".length)) as { runs: { text: string }[] }[]).map((l) => l.runs.map((r) => r.text).join(""))
    : null;

describe("a procedure's fix on the map", () => {
  it("says its name and altitude, as every map tag writes a figure", () => {
    expect(lineTexts(fixMarks(POBER, true, false, null, false).tag)).toEqual(["POBER FAF", "2,700"]);
  });

  it("leaves its name and figures to the plate's tag where its plate is drawn, keeping the pilot's own", () => {
    // The owner's pick, 2026-11-18: the plate's tag wins, a fix tagged once.
    expect(fixMarks(POBER, true, false, null, false, true).tag).toBeNull();
    expect(lineTexts(fixMarks(POBER, true, false, 3000, true, true).tag)).toEqual(["Cross 3,000", "Direct to"]);
  });
});
