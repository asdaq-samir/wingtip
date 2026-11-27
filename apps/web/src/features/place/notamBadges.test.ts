import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/notamSubject.json";
import type { AirportPlace } from "../../lib/api/types";
import type { FieldNotam } from "./fieldNotams";
import { notamMarks } from "./notamBadges";

/** The badges the engine answers on the planner (notam_subject, app.notam_reading) for each
 *  text against the shared fixture's card; the engine's own cases are its notam_subject.rs. */
type Badge = { on: string; index: number | null; word: string; severity: string; label: string };
const closed = (index: number, label: string): Badge => ({ on: "runway", index, word: "Closed", severity: "unusable", label });
const SUBJECTS: Record<string, Badge[]> = {
  "!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432": [closed(0, "Runway 09/27 closed.")],
  "!DLH 11/043 DLH RWY 09/27 CLSD 2611101200-2611121432": [closed(0, "Runway 09/27 closed.")],
  "!DLH 11/043 DLH RWY 03/21 CLSD 2611101200-2611121432": [closed(1, "Runway 03/21 closed.")],
  "!DLH 11/050 DLH TWY A BTN RWY 09 AND TWY C CLSD 2611101200-2611121432": [],
  "!DLH 11/052 DLH RWY 27 PAPI U/S 2611101200-2611202359": [
    { on: "light", index: 0, word: "Out of service", severity: "caution", label: "Runway 27 PAPI out of service." },
    { on: "runway", index: 0, word: "NOTAM", severity: "caution", label: "Runway 27 PAPI out of service." },
  ],
  "!FDC 6/1 ZMP ...": [
    { on: "field", index: null, word: "TFR", severity: "caution", label: "Temporary flight restriction near the field" },
  ],
};

const notam = (id: string, raw: string, extra: Partial<FieldNotam> = {}): FieldNotam =>
  ({
    subject: { badges: SUBJECTS[raw] ?? [] },
    id,
    kind: "notam",
    closed: false,
    raw,
    rank: 0,
    score: 0,
    top: false,
    tied: false,
    in_force: true,
    reasons: [],
    runways: [],
    ...extra,
  }) as FieldNotam;

const place = {
  ident: "KDLH",
  runways: fixture.card.runways.map((ends) => ({ ends })),
  lights: fixture.card.lights,
  procedures: fixture.card.approaches.map((name, i) => ({ kind: "IAP", name, url: `chart-${i}` })),
  frequencies: fixture.card.frequencies.map((f) => ({ type: f.type, frequency_mhz: f.mhz })),
} as unknown as AirportPlace;

describe("what a field's NOTAMs address on its card", () => {
  it("puts a closure on its runway and none on a taxiway between runways", () => {
    const marks = notamMarks(
      [
        notam("a", "!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432"),
        notam("b", "!DLH 11/050 DLH TWY A BTN RWY 09 AND TWY C CLSD 2611101200-2611121432"),
      ],
      place,
    );
    expect(marks.runway.get(0)?.word).toBe("Closed");
    expect(marks.runway.get(0)?.notams.map((n) => n.id)).toEqual(["a"]);
    expect(marks.runway.has(1)).toBe(false);
  });

  it("shows the worse of two on one thing, with both behind it, and none for one not yet in force", () => {
    const marks = notamMarks(
      [
        notam("papi", "!DLH 11/052 DLH RWY 27 PAPI U/S 2611101200-2611202359"),
        notam("closed", "!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432"),
        notam("later", "!DLH 11/043 DLH RWY 03/21 CLSD 2611101200-2611121432", { in_force: false }),
      ],
      place,
    );
    expect(marks.runway.get(0)).toMatchObject({ word: "Closed", severity: "unusable" });
    expect(marks.runway.get(0)?.notams.map((n) => n.id)).toEqual(["closed", "papi"]);
    expect(marks.light.get(0)?.word).toBe("Out of service");
    // Not yet in force: no badge, only its row in the list, Inactive.
    expect(marks.runway.has(1)).toBe(false);
  });

  it("leaves one not yet in force off a thing one in force is on", () => {
    const marks = notamMarks(
      [
        notam("later", "!DLH 11/043 DLH RWY 09/27 CLSD 2611101200-2611121432", { in_force: false }),
        notam("papi", "!DLH 11/052 DLH RWY 27 PAPI U/S 2611101200-2611202359"),
      ],
      place,
    );
    expect(marks.runway.get(0)).toMatchObject({ word: "NOTAM" });
    expect(marks.runway.get(0)?.notams.map((n) => n.id)).toEqual(["papi"]);
  });

  it("badges the field for a TFR near it", () => {
    expect(notamMarks([notam("t", "!FDC 6/1 ZMP ...", { kind: "tfr" })], place).field?.word).toBe("TFR");
  });
});
