import { describe, expect, it } from "vitest";
import { stopPlace } from "./useLegSheet";

describe("a stop's place for Remove on the leg sheet", () => {
  const rows = [
    { kind: "departure" },
    { kind: "stop" },
    { kind: "checkpoint" },
    { kind: "stop" },
    { kind: "stop" },
    { kind: "destination" },
  ];

  it("is its place among the route's points, the departure first, checkpoints not counted", () => {
    expect(stopPlace(rows, rows[1]!)).toBe(1);
    expect(stopPlace(rows, rows[3]!)).toBe(2);
    expect(stopPlace(rows, rows[4]!)).toBe(3);
  });
});
