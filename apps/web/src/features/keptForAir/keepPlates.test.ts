import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Course, FlightPlates } from "../../lib/api/types";
import { useBriefPlan } from "../../lib/briefPlan";
import { fixesOf, flightPlatesLine, flightPlatesQuery, keepFlightPlates } from "./keepPlates";

vi.mock("../../lib/kept/keepChart", () => ({
  keepChart: vi.fn(async (_c: unknown, chart: { url: string }) => {
    if (chart.url.endsWith("GONE.PDF")) throw new Error("404");
    return 1000;
  }),
}));

const chart = (pdf: string) => ({ kind: "IAP", name: pdf, url: `https://aeronav.faa.gov/d-tpp/2611/${pdf}` });

const plates = (over: Partial<FlightPlates> = {}): FlightPlates => ({
  range_nm: 90,
  reserve_min: 45,
  basis: "reserve",
  cycle: "2611",
  state: "current",
  next_at: "2026-12-24T09:01:00Z",
  alternate: null,
  alternate_picked: false,
  fields: [
    { ident: "KSFO", role: "departure", charts: [chart("A.PDF")] },
    { ident: "KWVI", role: "diversion", off_nm: 14, charts: [chart("B.PDF"), chart("GONE.PDF")] },
  ],
  charts: 3,
  bytes: 3 * 372_000,
  ...over,
});

describe("the plates Keep for the Air keeps for a flight", () => {
  test("their size is said before the keep, with the diversion range or what it needs", () => {
    expect(flightPlatesLine(plates())).toBe("This flight's plates: about 1 MB, 2 fields, within 90 nm of the route.");
    expect(flightPlatesLine(plates({ basis: "no_airplane", range_nm: null, fields: plates().fields.slice(0, 1) }))).toBe(
      "This flight's plates: about 1 MB, 1 field. Pick an airplane to keep the fields within diversion range too.",
    );
    expect(flightPlatesLine(null)).toBeNull();
  });

  test("every chart named is kept, one that cannot be had said as failed", async () => {
    expect(await keepFlightPlates(new QueryClient(), plates())).toEqual({ bytes: 2000, charts: 3, failed: true });
  });

  test("the ask carries the route, its line thinned, and the airplane's own cruise and fuel, never a stock one's", () => {
    const line = Array.from({ length: 200 }, (_, i) => [37 + i / 100, -122] as [number, number]);
    const course = {
      departure: { ident: "KSFO", kind: "airport" },
      destination: { ident: "KMRY", kind: "airport" },
      stops: [],
      course_line: line,
    } as unknown as Course;
    useBriefPlan.setState({ depart: "", eteMin: null, flight: null });
    const bare = flightPlatesQuery(course, null).queryKey[1] as Record<string, unknown>;
    expect(bare).toMatchObject({ route: "KSFO,KMRY", tas_kt: undefined, usable_gal: undefined, burn_gph: undefined, eta: undefined });
    expect((bare.fixes as string).split(";").length).toBeLessThanOrEqual(60);
    expect((bare.fixes as string).endsWith("38.9900,-122.0000")).toBe(true);
  });

  test("a line of any length is sent as 60 points at most, both ends among them", () => {
    for (let length = 2; length <= 400; length++) {
      const line = Array.from({ length }, (_, i) => [i, 0] as [number, number]);
      const sent = fixesOf(line).split(";");
      expect(sent.length).toBeLessThanOrEqual(60);
      expect([sent[0], sent.at(-1)]).toEqual(["0.0000,0.0000", `${(length - 1).toFixed(4)},0.0000`]);
    }
  });
});
