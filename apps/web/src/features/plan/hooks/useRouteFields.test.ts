import { describe, expect, test } from "vitest";
import { fieldPermission } from "../../../lib/verdict";
import { nasrStatus } from "./useRouteFields";

const field = (ident: string, role: "departure" | "stop" | "destination", status: string | null) => ({
  ident,
  role,
  private: false,
  military: null,
  phone: null,
  status,
});

describe("a closed field in the Go / No-Go", () => {
  test("worded by NASR's own code, as the engine's field_status says it (decision 0043)", () => {
    const status = nasrStatus({ status: "CI", closed: "Closed indefinitely" });
    expect(status).toBe("CI");
    const row = fieldPermission([field("C81", "departure", "O"), field("00MO", "destination", status)]);
    expect(JSON.stringify(row)).toContain("00MO is closed indefinitely (NASR)");
  });

  test("a card with no NASR record goes by its label, and one not in yet is unknown", () => {
    expect(nasrStatus({ status: null, closed: "Closed" })).toBe("");
    expect(nasrStatus({ status: null, closed: null })).toBe("O");
    expect(nasrStatus(undefined)).toBeNull();
  });
});
