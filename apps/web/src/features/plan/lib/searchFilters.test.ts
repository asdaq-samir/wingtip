import { describe, expect, it } from "vitest";
import type { NearestAirport } from "../../../lib/api/types";
import { NO_FILTERS, filterFields, filtersOn, readQuery } from "./searchFilters";

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
  it("narrows by each filter, together", () => {
    expect(filterFields(fields, { ...NO_FILTERS, towered: true }).map((a) => a.ident)).toEqual(["KMSN"]);
    expect(filterFields(fields, { ...NO_FILTERS, vfrNow: true }).map((a) => a.ident)).toEqual(["KMSN", "8WI1", "W12"]);
    expect(filterFields(fields, { ...NO_FILTERS, minRunwayFt: 2000, publicOnly: true }).map((a) => a.ident)).toEqual(["KMSN", "C29"]);
    expect(filterFields(fields, { ...NO_FILTERS, withinNm: 25 }).map((a) => a.ident)).toEqual(["KMSN", "C29"]);
  });
  it("counts the filters on", () => {
    expect(filtersOn(NO_FILTERS)).toBe(0);
    expect(filtersOn({ ...NO_FILTERS, towered: true, minRunwayFt: 3000 })).toBe(2);
  });
});

describe("readQuery", () => {
  it("reads the words for filters and the place named", () => {
    expect(readQuery("towered near KMSN")).toEqual({ near: "KMSN", filters: { towered: true } });
    expect(readQuery("vfr fields")).toEqual({ near: null, filters: { vfrNow: true } });
    expect(readQuery("KOSH")).toEqual({ near: "KOSH", filters: {} });
    expect(readQuery("fuel")).toEqual({ near: null, filters: {} });
  });
});
