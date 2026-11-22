import { describe, expect, test } from "vitest";
import { notamCredit, notamNone } from "./notamCoverage";

describe("the NOTAMs' coverage", () => {
  test("until the full set is held, the line says from when and that it is not the full set (decision 0059)", () => {
    expect(notamCredit("2026-10-19")).toBe("NOTAMs heard since 19 Oct 2026, not a full set");
    expect(notamCredit(null)).toBe("Recent NOTAMs only, not a full set");
    expect(notamCredit("2026-10-19", true)).toBe("FAA NOTAM System, every NOTAM in force");
  });

  test("an empty list reads none heard since the day, never no NOTAMs; none in force only from the full set", () => {
    expect(notamNone("2026-10-19")).toBe("None heard since 19 Oct");
    expect(notamNone(undefined)).toBe("None heard");
    expect(notamNone("2026-10-19", true)).toBe("None in force");
  });
});
