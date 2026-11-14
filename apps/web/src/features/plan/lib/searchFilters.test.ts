import { describe, expect, it } from "vitest";
import type { NearestAirport } from "../../../lib/api/types";
import { NO_FILTERS, filterFields, filtersOn, listWords, readQuery, vfrAtTime } from "./searchFilters";

const field = (over: Partial<NearestAirport>): NearestAirport =>
  ({
    ident: "KAAA",
    name: "A",
    kind: "small",
    lat: 43,
    lon: -89,
    distance_nm: 5,
    bearing_deg: 0,
    elevation_ft: 900,
    flight_category: "VFR",
    longest_runway_ft: 3000,
    towered: false,
    private: false,
    military: null,
    municipality: null,
    airspace_class: null,
    primary_of: null,
    radio: null,
    ...over,
  }) as NearestAirport;

describe("filterFields", () => {
  const fields = [
    field({ ident: "KMSN", towered: true, longest_runway_ft: 9006, distance_nm: 3 }),
    field({ ident: "C29", flight_category: "MVFR", longest_runway_ft: 2600, distance_nm: 12 }),
    field({ ident: "8WI1", private: true, longest_runway_ft: 1800, distance_nm: 30 }),
    field({ ident: "W12", longest_runway_ft: null, distance_nm: 40 }),
  ];
  it("keeps every field with no filter on", () => {
    expect(filterFields(fields, NO_FILTERS).map((a) => a.ident)).toEqual(["KMSN", "C29", "8WI1", "W12"]);
  });
  it("keeps the armed services' own fields out of Public, and a joint-use field in (the engine's public_use)", () => {
    const owned = [
      field({ ident: "KMXF", military: "military", distance_nm: 2 }),
      field({ ident: "KFHU", military: "joint", distance_nm: 4 }),
      field({ ident: "IL11", private: true, distance_nm: 6 }),
    ];
    expect(filterFields(owned, { ...NO_FILTERS, publicOnly: true }).map((a) => a.ident)).toEqual(["KFHU"]);
  });
  it("narrows by each filter, together", () => {
    expect(filterFields(fields, { ...NO_FILTERS, towered: true }).map((a) => a.ident)).toEqual(["KMSN"]);
    expect(filterFields(fields, { ...NO_FILTERS, vfrNow: true }).map((a) => a.ident)).toEqual(["KMSN", "8WI1", "W12"]);
    expect(filterFields(fields, { ...NO_FILTERS, minRunwayFt: 2000, publicOnly: true }).map((a) => a.ident)).toEqual(["KMSN", "C29"]);
    expect(filterFields(fields, { ...NO_FILTERS, withinNm: 25 }).map((a) => a.ident)).toEqual(["KMSN", "C29"]);
  });
  it("counts the filters on", () => {
    expect(filtersOn(NO_FILTERS)).toBe(0);
    expect(filtersOn({ ...NO_FILTERS, towered: true, minRunwayFt: 3000 })).toBe(2);
    expect(filtersOn({ ...NO_FILTERS, fuel: ["100LL", "Jet A"], vfrInHours: 3, approach: true })).toBe(3);
  });
});

describe("the filters of the planner's facts and forecast", () => {
  const fields = [
    field({
      ident: "KMSN",
      fuel: ["100LL", "Jet A"],
      runway_surfaces: ["paved"],
      instrument_approach: true,
      forecast: { at: 0, category: "IFR", station: "KMSN", distance_nm: null },
    }),
    field({ ident: "C29", fuel: ["100LL"], runway_surfaces: ["paved", "turf"], instrument_approach: true, forecast: null }),
    field({
      ident: "W12",
      fuel: [],
      runway_surfaces: ["turf", "water"],
      instrument_approach: null,
      forecast: { at: 0, category: "VFR", station: "KMSN", distance_nm: 20 },
    }),
  ];
  const kept = (f: Partial<typeof NO_FILTERS>) => filterFields(fields, { ...NO_FILTERS, ...f }).map((a) => a.ident);
  it("keeps a field selling any fuel picked", () => {
    expect(kept({ fuel: ["Jet A"] })).toEqual(["KMSN"]);
    expect(kept({ fuel: ["Jet A", "100LL"] })).toEqual(["KMSN", "C29"]);
    expect(kept({ fuel: ["UL94"] })).toEqual([]);
  });
  it("keeps a field with a runway of any surface picked", () => {
    expect(kept({ surface: ["turf"] })).toEqual(["C29", "W12"]);
    expect(kept({ surface: ["water"] })).toEqual(["W12"]);
  });
  it("keeps only a field known to have an approach", () => {
    expect(kept({ approach: true })).toEqual(["KMSN", "C29"]);
  });
  it("keeps only a field forecast VFR then: none forecast is not VFR", () => {
    expect(kept({ vfrInHours: 3 })).toEqual(["W12"]);
  });
});

describe("vfrAtTime", () => {
  it("asks for the top of the hour that many hours on, in seconds", () => {
    const now = Date.UTC(2026, 10, 10, 14, 25);
    expect(vfrAtTime(3, now)).toBe(Date.UTC(2026, 10, 10, 17) / 1000);
    expect(vfrAtTime(null, now)).toBeNull();
  });
});

describe("listWords", () => {
  it("says none, the one picked, or the first and how many more", () => {
    expect(listWords([], "Fuel")).toBe("Fuel");
    expect(listWords(["100LL"], "Fuel")).toBe("100LL");
    expect(listWords(["100LL", "Jet A"], "Fuel")).toBe("100LL +1");
  });
});

describe("readQuery", () => {
  it("reads the words for filters and the place named", () => {
    expect(readQuery("towered near KMSN")).toEqual({ near: "KMSN", filters: { towered: true } });
    expect(readQuery("vfr fields")).toEqual({ near: null, filters: { vfrNow: true } });
    expect(readQuery("KOSH")).toEqual({ near: "KOSH", filters: {} });
    expect(readQuery("fuel")).toEqual({ near: null, filters: {} });
    expect(readQuery("jet fuel near KMSN with an approach")).toEqual({ near: "KMSN", filters: { fuel: ["Jet A"], approach: true } });
    expect(readQuery("grass strips")).toEqual({ near: null, filters: { surface: ["turf"] } });
  });
});
