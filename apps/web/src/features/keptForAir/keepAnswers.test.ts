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

import { keepRouteAnswers } from "./keepAnswers";

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
