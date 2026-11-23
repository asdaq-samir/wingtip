// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Course } from "../../lib/api/types";

// Each of the route's fields' NOTAMs asked through the planner's GET, which
// the worker keeps as it passes; the rest of the keep answered by fakes.
const asked = vi.hoisted(() => ({ notams: [] as string[], failing: new Set<string>() }));
vi.mock("../../lib/queryClient", () => ({
  airportQuery: (ident: string) => ({ queryKey: ["airport", ident], queryFn: async () => ({ ident, procedures: [] }) }),
  fieldNotamsQuery: (ident: string) => ({
    queryKey: ["airport-notams", ident],
    queryFn: async () => {
      asked.notams.push(ident);
      if (asked.failing.has(ident)) throw new Error("no connection");
      return { notams: [], time_zone: null };
    },
  }),
}));
vi.mock("./keepFlightPath", () => ({ keepProfile: async () => {}, keepRadar: async () => ({ kept: true, bytes: 0 }) }));
vi.mock("../notamRanking", () => ({ notamRankingQuery: () => ({ queryKey: ["notamRanking"], queryFn: async () => ({ notams: [] }) }) }));
vi.mock("../../lib/briefPlan", () => ({ useBriefPlan: { getState: () => ({ routed: true }) } }));
vi.mock("../../lib/map/sources/weatherLayers", () => ({ useWeatherLayers: { getState: () => ({ loop: "radar" }) } }));
vi.mock("../../lib/api/client", () => ({ api: { weatherLoop: async () => ({ frames: [] }) } }));
// The flight's plates: two charts of one field, kept.
vi.mock("./keepPlates", () => ({
  flightPlatesQuery: () => ({
    queryKey: ["flightPlates"],
    queryFn: async () => ({
      fields: [
        {
          ident: "KDLH",
          charts: [{ url: "https://aeronav.faa.gov/d-tpp/2611/A.PDF" }, { url: "https://aeronav.faa.gov/d-tpp/2611/B.PDF" }],
        },
      ],
    }),
  }),
  keepFlightPlates: async () => ({ bytes: 5_000_000, charts: 2, failed: false }),
}));

import { keepRouteAnswers, keepRoutePlates } from "./keepAnswers";
import { keptRecordStore } from "./keptRecord";

const field = (ident: string) => ({ ident, kind: "airport", lat: 0, lon: 0 });
const course = { departure: field("C81"), stops: [field("KMSN")], destination: field("KDLH") } as unknown as Course;

beforeEach(() => {
  asked.notams = [];
  asked.failing.clear();
});

describe("Keep for the Air's NOTAMs", () => {
  test("keeps the departure's, each stop's and the destination's own NOTAMs with the briefing", async () => {
    const kept = await keepRouteAnswers(new QueryClient(), course, null);
    expect(asked.notams.sort()).toEqual(["C81", "KDLH", "KMSN"]);
    expect(kept.onBoard).toContain("notams");
    expect(kept.missing).not.toContain("notams");
  });

  test("says the NOTAMs are missing where one field's could not be had", async () => {
    asked.failing.add("KMSN");
    const kept = await keepRouteAnswers(new QueryClient(), course, null);
    expect(kept.missing).toContain("notams");
    expect(kept.onBoard).not.toContain("notams");
  });
});

describe("Keep for the Air's plates, after the chart tiles", () => {
  test("are added to the route's record: their size, their charts and on board", async () => {
    const answers = await keepRouteAnswers(new QueryClient(), course, null);
    expect(answers.onBoard).not.toContain("plates");
    await keepRoutePlates(new QueryClient(), course, null);
    const record = keptRecordStore().getState().value!;
    expect(record.bytes).toBe(answers.bytes + 5_000_000);
    expect(record.plates).toHaveLength(2);
    expect(record.onBoard).toContain("plates");
  });

  test("leave another route's record as it is", async () => {
    await keepRouteAnswers(new QueryClient(), course, null);
    const other = { ...course, destination: field("KMSP") } as unknown as Course;
    const before = keptRecordStore().getState().value;
    await keepRoutePlates(new QueryClient(), other, null);
    expect(keptRecordStore().getState().value).toEqual(before);
  });
});
