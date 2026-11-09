import { describe, expect, it } from "vitest";
import { callEngine } from "../../../lib/engine/engine";
import coachFixture from "../../../lib/fixtures/coach.json";
import type { ApproachDebrief } from "../../../components/approachDebriefModel";
import type { Currency, LogbookEntry, Training } from "../../../lib/api/types";
import { approachDebrief } from "./coachDebriefs";
import { askOf, guessed } from "./useCoach";

describe("the coach's plan", () => {
  it("is the engine's for the shared fixture pilots", () => {
    for (const pilot of coachFixture.pilots) {
      const plan = callEngine("proficiency_plan", pilot.ask as never);
      const due = Object.fromEntries(plan.due.map(d => [d.key, [d.status, d.until]]));
      expect(due, pilot.name).toEqual(pilot.expected.due);
      expect(plan.sessions.map(s => [s.key, s.place?.ident ?? null]), pilot.name).toEqual(pilot.expected.sessions);
    }
  });

  it("asks with the certificate the pilot holds", () => {
    const currency = { flightReviewOn: "2024-11-20", medicalExpiresOn: null, ipcOn: null } as unknown as Currency;
    const training = { endorsements: [{ code: "solo-90", endorsedOn: "2026-09-01", until: "2026-11-30" }] } as unknown as Training;
    const student = askOf([], currency, training, "student", "C29", [], "2026-11-09");
    expect(student.ratings).toEqual(["student"]);
    expect(student.held).toEqual([{ code: "solo-90", on: "2026-09-01" }]);
    const rated = askOf([], currency, training, "instrument", null, [], "2026-11-09");
    expect(rated.ratings).toEqual(["private", "instrument"]);
    expect(rated.held).toEqual([]);
    expect(rated.flightReviewOn).toBe("2024-11-20");
  });

  it("guesses a certificate until the pilot picks one", () => {
    expect(guessed([], undefined, { endorsements: [{}] } as unknown as Training)).toBe("student");
    expect(guessed([{ approaches: 2 } as LogbookEntry], undefined, undefined)).toBe("instrument");
    expect(guessed([], undefined, undefined)).toBe("private");
  });

  it("trims an approach's debrief to its profile, findings and the field's elevation", () => {
    const a = {
      airport: "KMSN", findings: [{ tone: "stop", text: "Below the glide slope's full scale for 0.4 nm" }],
      profile: { track: [{ toGoNm: 1, altFt: 1300, off: true }], fixes: [], glidepath: null },
    } as unknown as ApproachDebrief;
    expect(approachDebrief(a, 887, "2026-10-25")).toEqual({
      kind: "approach", flown_on: "2026-10-25", place: "KMSN", elevation_ft: 887,
      profile: [{ to_go_nm: 1, alt_ft: 1300, off: true }], legs: [], patterns: [],
      findings: [{ tone: "stop", text: "Below the glide slope's full scale for 0.4 nm" }],
    });
  });
});
