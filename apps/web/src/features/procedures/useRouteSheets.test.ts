// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NavLogRow } from "../plan";
import { holdAsked, useRouteSheets } from "./useRouteSheets";

// Rows as far as the hook reads them: a kind, an airport and a leg's figures.
const stop = (ident: string, course: number, altitude: number) =>
  ({ kind: "stop", airport: { ident }, leg: { magnetic_course_deg: course, altitude_ft: altitude } }) as unknown as NavLogRow;

describe("a hold asked for from elsewhere", () => {
  it("reads the ask's fix and visit", () => {
    expect(holdAsked("VPBNG@1@1700000000000")).toEqual({ fix: "VPBNG", seen: 1 });
  });

  it("takes the course in of the visit's own row, not the first visit's", () => {
    const rows = [stop("VPBNG", 90, 3000), stop("KMSN", 180, 4000), stop("VPBNG", 270, 5000)];
    const second = renderHook(() => useRouteSheets({ holds: [], rows, askHold: "VPBNG@1@1" }));
    expect(second.result.current.holdAt).toMatchObject({ fix: "VPBNG", arrivalDeg: 270, altitudeFt: 5000 });
    const first = renderHook(() => useRouteSheets({ holds: [], rows, askHold: "VPBNG@0@2" }));
    expect(first.result.current.holdAt).toMatchObject({ arrivalDeg: 90, altitudeFt: 3000 });
  });
});
