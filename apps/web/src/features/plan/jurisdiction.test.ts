import { describe, expect, test } from "vitest";
import { rowCautions } from "./jurisdiction";
import type { NavLogRow } from "./navLogRows";

// The engine's words for a route are held to the shared fixture by the
// engine (engine/facade/tests/jurisdiction.rs) and asked by the planner
// with the course (app.route_borders); here, that each row says its own.
const leg = "The leg to KBKL crosses Canada (Ontario): Canadian rules not checked — figures use US rules";
const at = "CYQT is in Canada (Ontario): Canadian rules not checked — figures use US rules";
const row = (kind: NavLogRow["kind"], outside: string | null = null, leaving: string | null = null) =>
  ({
    kind,
    key: kind,
    airport: { ident: "X", lat: 0, lon: 0, kind: "airport", outside_caution: outside, leg_caution: leaving },
  }) as unknown as NavLogRow;

describe("whose rules each row of the nav log is under (decision 0053)", () => {
  test("a leg's caution on the row it leaves, a field's at the field, none between", () => {
    expect(rowCautions([row("departure", null, leg), row("checkpoint"), row("destination", at)])).toEqual([
      { at: null, leaving: leg },
      { at: null, leaving: null },
      { at, leaving: null },
    ]);
  });

  test("a point the course has no word for says nothing", () => {
    const bare = { kind: "departure", key: "d", airport: { ident: "@42,-88", lat: 42, lon: -88, kind: "airport" } } as unknown as NavLogRow;
    expect(rowCautions([bare])).toEqual([{ at: null, leaving: null }]);
  });
});
