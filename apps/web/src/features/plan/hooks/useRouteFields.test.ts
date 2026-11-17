import { describe, expect, test } from "vitest";
import { nasrStatus } from "./useRouteFields";

// The closed field's row itself, worded from this code by the engine, is
// lib/verdict.test.ts's (gonogo_brief's fields).
describe("a field's NASR status for the Go / No-Go (decision 0043)", () => {
  test("NASR's own code where the card has it", () => {
    expect(nasrStatus({ status: "CI", closed: "Closed indefinitely" })).toBe("CI");
  });

  test("a card with no NASR record goes by its label, and one not in yet is unknown", () => {
    expect(nasrStatus({ status: null, closed: "Closed" })).toBe("");
    expect(nasrStatus({ status: null, closed: null })).toBe("O");
    expect(nasrStatus(undefined)).toBeNull();
  });
});
