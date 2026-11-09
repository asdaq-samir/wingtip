import { describe, expect, it } from "vitest";
import cases from "../../lib/fixtures/documents.json";
import answers from "../../lib/fixtures/documentAnswers.json";
import type { DocumentRead, HandbookFigures } from "../../lib/api/types";
import {
  checkHandbook, checkLogbook, confirmedFigures, confirmedHandbook, handbookOf, loggable, logbookOf, mergeHandbook, withFigure,
  type HandbookRead, type LogbookRead,
} from "./reads";

// The same pages the engine's own tests read (facade/tests/documents.rs),
// and what the assistant answers for them (documentAnswers.json).
const clean = cases.handbook[0]!.input as HandbookRead;

describe("a handbook page's figures, as the review changes them", () => {
  it("each case's flags are the engine's, asked from the browser", () => {
    for (const c of cases.handbook) {
      const items = checkHandbook(c.input as HandbookRead).items;
      for (const [key, level, words] of c.flags as [string, string, string][]) {
        const item = items.find(i => i.key === key);
        expect(item?.flags.some(f => f.level === level && f.says.includes(words)), `${c.name}: ${key}`).toBe(true);
      }
    }
  });

  it("the server's check and the browser's are the same answer", () => {
    const read = answers.handbook as unknown as DocumentRead;
    expect(checkHandbook(handbookOf(read) as HandbookRead)).toEqual(read.handbook_check);
  });

  it("only the confirmed items are kept, and the form's figures come from them", () => {
    const kept = confirmedHandbook(clean, new Set(["cruise.2", "fuel"]));
    expect(kept.cruise).toEqual([clean.cruise![2]]);
    expect(kept.takeoff).toEqual([]);
    expect(kept.climb).toBeNull();
    expect(kept.envelope).toEqual([]);
    expect(kept.max_takeoff_weight).toBeNull();
    const { handbook, profile } = confirmedFigures(clean, new Set(["cruise.2", "fuel"]));
    expect(profile).toMatchObject({ cruise_tas_kt: 113, fuel_burn_gph: 8.5, cruise_power_pct: 65, usable_fuel_gal: 53, climb_fuel_burn_gph: null });
    expect(handbook.cruise).toHaveLength(1);
    expect(handbook.envelope).toEqual([]);
  });

  it("nothing confirmed keeps nothing", () => {
    const { handbook, profile } = confirmedFigures(clean, new Set());
    expect(handbook.cruise).toEqual([]);
    expect(profile.cruise_tas_kt).toBeNull();
    expect(profile.usable_fuel_gal).toBeNull();
  });

  it("a figure corrected at its path is checked again, the read itself unchanged", () => {
    const misread = cases.handbook[2]!.input as HandbookRead;
    expect(checkHandbook(misread).items.find(i => i.key === "takeoff.0")?.flags.some(f => f.level === "wrong")).toBe(true);
    // The two distances were swapped: put them right.
    const fixed = withFigure(withFigure(misread, "takeoff.0.ground_roll", 935), "takeoff.0.over_obstacle", 1665);
    expect(misread.takeoff![0]!.ground_roll).toBe(1665);
    expect(checkHandbook(fixed).items.find(i => i.key === "takeoff.0")?.flags).toEqual([]);
  });

  it("a second page's figures go over the first's, and what it did not give stays", () => {
    const performance = confirmedFigures(clean, new Set(["cruise.2", "glide"])).handbook;
    const balance = { ...confirmedFigures(clean, new Set(["empty", "envelope", "weight"])).handbook } as HandbookFigures;
    const both = mergeHandbook(performance, balance);
    expect(both.cruise).toHaveLength(1);
    expect(both.glide_ratio).toBe(9);
    expect(both.empty_weight_lb).toBe(1680);
    expect(both.envelope).toHaveLength(5);
  });
});

describe("a logbook page's flights", () => {
  const wrong = answers.logbookWrong as unknown as DocumentRead;
  const read = logbookOf(wrong) as LogbookRead;

  it("a flight with no date cannot be logged until it has one", () => {
    const before = checkLogbook(read, "2026-11-09");
    expect(loggable(before.rows[2]!.entry)).toBe(false);
    const after = checkLogbook(withFigure(read, "rows.2.date", "2026-10-01"), "2026-11-09");
    expect(loggable(after.rows[2]!.entry)).toBe(true);
    expect(after.rows[2]!.flags.some(f => f.field === "flownOn")).toBe(false);
  });

  it("a page whose rows are right has nothing to check", () => {
    const good = answers.logbook as unknown as DocumentRead;
    const check = checkLogbook(logbookOf(good) as LogbookRead, "2026-11-09");
    expect(check.flags).toEqual([]);
    expect(check.rows.every(r => r.flags.length === 0 && loggable(r.entry))).toBe(true);
    expect(check.rows[2]!.entry).toMatchObject({ route: "KANE KFCM KANE", approaches: 2, holding: true, instrumentHours: 1 });
  });
});
