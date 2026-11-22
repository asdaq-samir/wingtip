import { describe, expect, test } from "vitest";
import { engineReady } from "../../lib/engine/engine";
import fieldNames from "../../lib/fixtures/fieldNames.json";
import { identsOf } from "./fieldNotams";

// A NOTAM's field by every name it may be filed under: the engine's
// field_names, by the shared fixture (FAA JO 7350.9GG 4-1).
describe("identsOf, by the shared fixture", () => {
  test.each(fieldNames.cases.filter((c) => c.icao_id === null))("$ident", async ({ ident, names }) => {
    await engineReady;
    expect(identsOf(ident)).toEqual(names);
  });
});
