import { describe, expect, test } from "vitest";
import type { EmergencyFields } from "../../lib/api/types";
import { bestFields, checklistSection, maydayCall, positionWords, visibilities } from "./emergency";
import fixture from "../../lib/fixtures/emergency.json";

/** The fixture's fields as the planner's /api/emergency/fields sends them. */
function planner(airplane = true): EmergencyFields {
  const input = fixture.lakeGeneva.input;
  return {
    wind: input.wind,
    airplane: airplane
      ? {
          name: "c172",
          type: "Cessna 172",
          glide: { ...input.airplane.glide, source: "test" },
          crosswind: { demonstrated_kt: 15, source: "test" },
        }
      : null,
    fields: input.fields.map((f) => ({
      ...f,
      distance_nm: 0,
      bearing_deg: 0,
      private: "private" in f ? f.private : false,
      military: null,
      towered: false,
      metar: "metar" in f ? f.metar : null,
      frequencies: [],
      phone: null,
      runways: f.runways.map((r) => ({ ...r, closed: false })),
    })) as EmergencyFields["fields"],
  };
}

const FIX = { lat: 42.5917, lon: -88.4334, altitudeFt: 4500, speedKt: 95 };

describe("the emergency assistant, by the engine", () => {
  test("over Lake Geneva at 4,500 ft the fields within a glide come first", () => {
    const ranked = bestFields(planner(), FIX, -3.5);
    expect(ranked.fields.map((f) => f.ident)).toEqual(fixture.lakeGeneva.order);
    expect(ranked.fields.map((f) => f.reach)).toEqual(fixture.lakeGeneva.reach);
    expect(ranked.glide?.ring).toHaveLength(36);
  });

  test("the planner's military passed as it comes: a joint-use field is no military field (private-fields audit PF-4)", () => {
    const data = planner();
    const [first, second] = data.fields;
    data.fields = data.fields.map((f) => (f === first ? { ...f, military: "joint" } : f === second ? { ...f, military: "military" } : f));
    const ranked = bestFields(data, FIX, -3.5);
    const said = (ident: string) =>
      ranked.fields
        .find((f) => f.ident === ident)!
        .reasons.map((r) => r.text)
        .join(" ");
    expect(ranked.fields.find((f) => f.ident === first!.ident)!.military).toBe("joint");
    expect(said(first!.ident)).not.toMatch(/military/i);
    expect(said(second!.ident)).toMatch(/military/i);
  });

  test("with no airplane the glide is not guessed: nearest first", () => {
    const ranked = bestFields(planner(false), FIX, null);
    expect(ranked.needs_airplane).toBe(true);
    expect(ranked.glide).toBeNull();
    expect(ranked.fields.map((f) => f.ident)).toEqual(fixture.lakeGeneva.noAirplane);
  });

  test("the MAYDAY in the AIM's order, its blanks listed", () => {
    const { frequencies, ...facts } = fixture.mayday.input;
    const data = {
      fields: frequencies.map((f) => ({ ident: f.ident, distance_nm: f.distance_nm, frequencies: [{ kind: f.kind, mhz: f.mhz }] })),
    } as unknown as EmergencyFields;
    const call = maydayCall(facts, data);
    expect(call.lines).toEqual(fixture.mayday.lines);
    expect(call.missing).toEqual(fixture.mayday.missing);
    expect(call.channels.map((c) => c.mhz)).toEqual(fixture.mayday.mhz);
  });

  test.each(fixture.sections)("the checklist opens at the emergency asked: %o", (c) => {
    expect(checklistSection(c.titles, c.want ?? undefined)).toBe(c.index);
  });

  test("the position off the nearest field with no VOR in view", () => {
    expect(positionWords({ lat: 42.59, lon: -88.43 }, [], { name: "Grand Geneva Resort", distance_nm: 2.4, bearing_deg: 54 })).toBe(
      "2 nm SW of Grand Geneva Resort",
    );
  });
});

describe("visibilities", () => {
  test("a field's reported visibility as the pilot reads it, none where the report gives none", () => {
    const data = planner();
    const [first, second] = data.fields;
    const metar = { raw: "", visibility_sm: null, visibility_plus: false };
    const fields = [
      { ...first!, ident: "KAAA", metar: { ...metar, visibility_sm: 10, visibility_plus: true } },
      { ...second!, ident: "KBBB", metar: { ...metar, visibility_sm: 3 } },
      { ...first!, ident: "KCCC", metar },
      { ...second!, ident: "KDDD", metar: null },
    ];
    const read = visibilities({ ...data, fields });
    expect([...read]).toEqual([
      ["KAAA", "10+ sm"],
      ["KBBB", "3 sm"],
    ]);
  });
});
