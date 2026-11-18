import { describe, expect, it } from "vitest";
import { nthTyped, visitAt, visitRow } from "./visits";

describe("nthTyped", () => {
  const route = ["C81", "VPBNG", "KMSN", "VPBNG", "KDLH"];

  it("finds each visit of a fix flown twice at its own place", () => {
    expect(nthTyped(route, "VPBNG", 0)).toBe(1);
    expect(nthTyped(route, "VPBNG", 1)).toBe(3);
  });

  it("is -1 past the last visit and for a point not typed", () => {
    expect(nthTyped(route, "VPBNG", 2)).toBe(-1);
    expect(nthTyped(route, "V100", 0)).toBe(-1);
  });

  it("never answers the departure, a field's own step", () => {
    expect(nthTyped(["C81", "KMSN", "C81"], "C81", 0)).toBe(2);
  });
});

describe("visitAt", () => {
  const route = ["C81", "VPBNG", "KMSN", "VPBNG", "KDLH"];

  it("counts each visit of a point the route is at twice, from 1", () => {
    expect(visitAt(route, 1)).toEqual({ seen: 0, visit: 1 });
    expect(visitAt(route, 3)).toEqual({ seen: 1, visit: 2 });
  });

  it("gives no visit to a point the route is at once, nor to the departure", () => {
    expect(visitAt(route, 2)).toEqual({ seen: 0, visit: undefined });
    expect(visitAt(["C81", "KMSN", "C81"], 0)).toEqual({ seen: 0, visit: undefined });
    expect(visitAt(["C81", "KMSN", "C81"], 2)).toEqual({ seen: 0, visit: undefined });
  });
});

describe("visitRow", () => {
  const rows = [
    { kind: "departure", key: "d", airport: { ident: "C81" } },
    { kind: "stop", key: "s1", airport: { ident: "VPBNG" } },
    { kind: "checkpoint", key: "c" },
    { kind: "stop", key: "s2", airport: { ident: "KMSN" } },
    { kind: "stop", key: "s3", airport: { ident: "VPBNG" } },
    { kind: "destination", key: "a", airport: { ident: "KDLH" } },
  ];

  it("finds each visit's own row", () => {
    expect(visitRow(rows, "Stop", "VPBNG", 0)?.key).toBe("s1");
    expect(visitRow(rows, "Stop", "VPBNG", 1)?.key).toBe("s3");
  });

  it("finds the ends' rows by their kind", () => {
    expect(visitRow(rows, "Departure", "C81", 0)?.key).toBe("d");
    expect(visitRow(rows, "Destination", "KDLH", 0)?.key).toBe("a");
  });
});
