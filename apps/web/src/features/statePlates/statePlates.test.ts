import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { deleteState, keepState, keptStatesStore, replaced, unfinished } from "./statePlates";

vi.mock("../../lib/kept/keepChart", async (real) => ({
  ...(await real<typeof import("../../lib/kept/keepChart")>()),
  keepChart: vi.fn(async (_c: unknown, chart: { url: string }) => {
    if (chart.url.endsWith("GONE.PDF")) throw new Error("404");
    return 1000;
  }),
}));

const chart = (cycle: string, pdf: string, kind = "IAP") => ({ kind, name: pdf, url: `https://aeronav.faa.gov/d-tpp/${cycle}/${pdf}` });

/** California in two cycles, Nevada sharing its takeoff minimums' booklet. */
const LISTS: Record<string, unknown> = {
  "2611/CA": {
    cycle: "2611",
    next_at: "2026-12-24T09:01:00Z",
    id: "CA",
    name: "California",
    fields: [
      { ident: "KMRY", charts: [chart("2611", "00366IL10R.PDF"), chart("2611", "SW2TO.PDF", "MIN")] },
      { ident: "KSNS", charts: [chart("2611", "GONE.PDF")] },
    ],
  },
  "2612/CA": {
    cycle: "2612",
    next_at: "2027-01-21T09:01:00Z",
    id: "CA",
    name: "California",
    fields: [{ ident: "KMRY", charts: [chart("2612", "00366IL10R.PDF")] }],
  },
  "2611/NV": {
    cycle: "2611",
    next_at: "2026-12-24T09:01:00Z",
    id: "NV",
    name: "Nevada",
    fields: [{ ident: "KRNO", charts: [chart("2611", "SW2TO.PDF", "MIN")] }],
  },
};

function client() {
  const c = new QueryClient();
  for (const [key, list] of Object.entries(LISTS)) {
    const [cycle, id] = key.split("/");
    c.setQueryData(["plateState", cycle, id], list);
  }
  return c;
}

/** The worker's cache, as its requests' addresses. */
function cache(urls: string[]) {
  const held = new Set(urls);
  vi.stubGlobal("caches", {
    open: async () => ({ keys: async () => [...held].map((url) => new Request(url)), delete: async (r: Request) => held.delete(r.url) }),
  });
  return held;
}

const page = (cycle: string, pdf: string) => `http://localhost/api/planner/faa-chart/page/dtpp/${cycle}/${pdf}/1.png`;
const list = (cycle: string, pdf: string, ident: string) =>
  `http://localhost/api/planner/faa-chart?url=${encodeURIComponent(`https://aeronav.faa.gov/d-tpp/${cycle}/${pdf}`)}&airport=${ident}`;

beforeEach(() => keptStatesStore().setState({ value: [] }));
afterEach(() => vi.unstubAllGlobals());

describe("plates kept by state", () => {
  test("every chart of the state is fetched, the ones that fail counted, the state named with its cycle", async () => {
    await keepState(client(), "CA", "2611");
    const [kept] = keptStatesStore().getState().value;
    expect(kept).toMatchObject({ id: "CA", name: "California", cycle: "2611", charts: 3, done: 3, failed: 1, bytes: 2000 });
    expect(unfinished(kept!)).toBe(false);
  });

  test("a kept state is replaced from its next cycle's 0901Z, not a minute before", () => {
    const kept = { id: "CA", name: "California", cycle: "2611", nextAt: "2026-12-24T09:01:00Z", charts: 1, done: 1, failed: 0, bytes: 1 };
    expect(replaced(kept, Date.parse("2026-12-24T09:00:00Z"))).toBe(false);
    expect(replaced(kept, Date.parse("2026-12-24T09:01:00Z"))).toBe(true);
  });

  test("updated to the next cycle, the old cycle's pages go once the new one is whole", async () => {
    const c = client();
    await keepState(c, "CA", "2611");
    const held = cache([page("2611", "00366IL10R.PDF"), list("2611", "00366IL10R.PDF", "KMRY"), page("2612", "00366IL10R.PDF")]);
    await keepState(c, "CA", "2612");
    expect(
      keptStatesStore()
        .getState()
        .value.map((k) => k.cycle),
    ).toEqual(["2612"]);
    expect([...held]).toEqual([page("2612", "00366IL10R.PDF")]);
  });

  test("a state deleted takes its pages, but not a booklet another kept state holds", async () => {
    const c = client();
    await keepState(c, "CA", "2611");
    await keepState(c, "NV", "2611");
    const held = cache([page("2611", "00366IL10R.PDF"), page("2611", "SW2TO.PDF"), list("2611", "SW2TO.PDF", "KMRY")]);
    await deleteState(c, "CA");
    expect(
      keptStatesStore()
        .getState()
        .value.map((k) => k.id),
    ).toEqual(["NV"]);
    expect([...held].sort()).toEqual([list("2611", "SW2TO.PDF", "KMRY"), page("2611", "SW2TO.PDF")].sort());
  });
});
