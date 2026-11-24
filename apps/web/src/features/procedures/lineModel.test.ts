/**
 * What one line of FPL's timeline shows (lineModel): when it opens to its
 * runways and procedures, and when its fuel is set there rather than read.
 * The field's parts and its missed approach are their own modules' (their
 * tests); here they are stood in for.
 */
import { describe, expect, it, vi } from "vitest";
import type { NavLogRow, ProcedureAirport } from "../plan";
import { lineModel, type TimelinePoint } from "./lineModel";
import type { ProceduresRouteModel } from "./useProceduresRoute";

vi.mock("./fieldParts", () => ({
  fieldParts: () => [
    { role: "Arrive", kinds: ["arrival", "approach"] },
    { role: "Depart", kinds: ["departure"] },
  ],
  kindPicked: (vm: ProceduresRouteModel, _a: ProcedureAirport, kind: string) => vm.inRoute.some((p) => p.kind === kind),
}));
vi.mock("./approachState", () => ({ missedOnTheLine: () => false }));

const tank = { gal: 30, usable: 50, low: false };
const vm = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    edit: {},
    tanks: new Map([["departure", tank]]),
    onTanks: () => {},
    inRoute: [],
    holdOn: () => null,
    reportedOf: () => null,
    ...over,
  }) as unknown as ProceduresRouteModel;
const point = (over: Partial<TimelinePoint> = {}): TimelinePoint => ({
  ident: "KMSN",
  role: "Departure",
  index: 0,
  seen: 0,
  visit: undefined,
  time: null,
  fixTime: () => null,
  category: "VFR",
  problem: null,
  checking: false,
  fuelStop: false,
  field: true,
  ...over,
});
const field = { ident: "KMSN", role: "Departure" } as unknown as ProcedureAirport;
const departure = { kind: "departure", key: "departure", airport: { ident: "KMSN" } } as unknown as NavLogRow;

describe("a line opens", () => {
  it("at a field the list edits, known open", () => {
    expect(lineModel(vm(), point(), departure, field).opens).toBe(true);
  });

  it("never at a closed field, one not yet known open (decision 0043), a waypoint or where the list is read", () => {
    expect(lineModel(vm(), point({ problem: "Closed" }), departure, field).opens).toBe(false);
    expect(lineModel(vm(), point({ checking: true }), departure, field).opens).toBe(false);
    expect(lineModel(vm(), point({ field: false }), departure, undefined).opens).toBe(false);
    expect(lineModel(vm({ edit: null }), point(), departure, field).opens).toBe(false);
  });
});

describe("its fuel is set there", () => {
  it("at the departure and a stop, where the list edits the route", () => {
    expect(lineModel(vm(), point(), departure, field).fuelSet).not.toBeNull();
    const stop = { ...departure, kind: "stop", key: "stop-1" } as unknown as NavLogRow;
    const stops = vm({ tanks: new Map([["stop-1", tank]]) });
    expect(lineModel(stops, point({ role: "Stop" }), stop, field).fuelSet).not.toBeNull();
  });

  it("read only at the destination, a field it cannot land at, or with no tanks to set", () => {
    const destination = { ...departure, kind: "destination", key: "destination" } as unknown as NavLogRow;
    const there = vm({ tanks: new Map([["destination", tank]]) });
    expect(lineModel(there, point({ role: "Destination" }), destination, field).fuelSet).toBeNull();
    expect(lineModel(vm(), point({ problem: "Closed" }), departure, field).fuelSet).toBeNull();
    expect(lineModel(vm({ onTanks: undefined }), point(), departure, field).fuelSet).toBeNull();
  });
});

describe("its procedures", () => {
  it("a picked kind's fixes sit on the line, before for an arrival, after for a departure; the rest are offered", () => {
    const m = lineModel(vm({ inRoute: [{ kind: "departure", ident: "KMSN" }] }), point(), departure, field);
    expect(m.before).toEqual([]);
    expect(m.after).toEqual(["departure"]);
    expect(m.parts.map((p) => p.add)).toEqual([["arrival", "approach"], []]);
  });

  it("a refused move is said only under the point it was tried on", () => {
    const refusing = vm({ edit: { refusal: { index: 0, note: "The departure stays first" } } });
    expect(lineModel(refusing, point(), departure, field).refused).toBe("The departure stays first");
    expect(lineModel(refusing, point({ index: 1 }), departure, field).refused).toBeNull();
  });
});
