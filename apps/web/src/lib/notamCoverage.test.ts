import { describe, expect, test } from "vitest";
import { notamCredit, notamNone } from "./notamCoverage";

describe("the NOTAMs' coverage", () => {
  test("the credit names the feed and the day it was first heard, in the app's date format", () => {
    expect(notamCredit("2026-10-19")).toBe("FAA NOTAM feed since 19 Oct 2026");
    expect(notamCredit(null)).toBe("FAA NOTAM feed");
  });

  test("an empty list reads none heard since the day, never no NOTAMs", () => {
    expect(notamNone("2026-10-19")).toBe("None heard since 19 Oct");
    expect(notamNone(undefined)).toBe("None heard");
  });
});
