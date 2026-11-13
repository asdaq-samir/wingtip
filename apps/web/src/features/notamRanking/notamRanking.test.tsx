// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { RankedNotam, RankedNotams } from "./engineRanking";
import NotamRankingSection from "./NotamRankingSection";
import { runwaysOfPicks, splitRanking } from "./useNotamRanking";
import { useNotamMarks } from "./notamMarks";
import { ALL_NOTAMS } from "./notamView";

afterEach(() => {
  cleanup();
  useNotamMarks.setState({ pinned: [], read: [], filter: ALL_NOTAMS, sort: "rank" });
});

const notam = (id: string, top: boolean, why: string, over: Partial<RankedNotam> = {}): RankedNotam => ({
  id,
  kind: "notam",
  label: `NOTAM ${id}`,
  why,
  top,
  rank: 1,
  score: 1,
  tied: false,
  field: null,
  in_force: true,
  reasons: [],
  raw: `!${id} RAW`,
  starts: null,
  ends: null,
  ...over,
});

const ANSWER: RankedNotams = {
  notams: [
    notam("OSH 11/012", true, "Your landing runway 18/36 at KOSH is closed 1400Z to 1800Z."),
    notam("OSH 11/015", true, "Taxiway B at KOSH is closed while you are there."),
    notam("ZAU 11/301", true, "Parachute jumping near Fond du Lac, surface to FL180."),
    notam("C81 11/004", false, "No 100LL at C81 before you leave."),
    notam("OSH 11/030", false, "Runway 09/27 closes tomorrow.", { in_force: false }),
  ],
  top: 3,
  coverage_since: "2026-10-19",
  unchecked: [],
};

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("./useNotamRanking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useNotamRanking")>()),
  useNotamRanking: () => state.value,
}));

describe("the NOTAMs that matter", () => {
  test("the plan's takeoff and pattern picks are the runways in use, by field", () => {
    expect(runwaysOfPicks("takeoff=C81%3A06&pattern=KOSH%3A36&altitude_ft=4500")).toEqual({ C81: "06", KOSH: "36" });
    expect(runwaysOfPicks(undefined)).toEqual({});
  });

  test("the top ones are said first and the rest folded, none dropped", () => {
    const { top, rest } = splitRanking(ANSWER);
    expect(top.map((n) => n.id)).toEqual(["OSH 11/012", "OSH 11/015", "ZAU 11/301"]);
    expect(rest.map((n) => n.id)).toEqual(["C81 11/004", "OSH 11/030"]);
  });

  test("three lines with their chips, the rest behind N more, and the feed's coverage under them", () => {
    state.value = { shown: true, ...splitRanking(ANSWER), answer: ANSWER, error: null, pending: false };
    render(<NotamRankingSection />);
    const lines = screen.getAllByTestId("brief-notam");
    expect(lines.map((l) => l.querySelector("p")!.textContent)).toEqual(ANSWER.notams.slice(0, 3).map((n) => n.why));
    expect(screen.getAllByTestId("brief-notam-source").map((c) => c.textContent)).toEqual([
      "NOTAM OSH 11/012",
      "NOTAM OSH 11/015",
      "NOTAM ZAU 11/301",
    ]);
    expect(screen.queryByTestId("brief-notams-rest")).toBeNull();
    fireEvent.click(screen.getByTestId("brief-notams-more"));
    expect(screen.getByTestId("brief-notams-more").textContent).toContain("2 more");
    expect(screen.getAllByTestId("brief-notam-folded")).toHaveLength(2);
    expect(screen.getByTestId("brief-notams-credit").textContent).toBe("FAA NOTAM feed since 19 Oct 2026");
  });

  test("none heard reads as such, never as no NOTAMs", () => {
    const none: RankedNotams = { ...ANSWER, notams: [], top: 0 };
    state.value = { shown: true, top: [], rest: [], answer: none, error: null, pending: false };
    render(<NotamRankingSection />);
    expect(screen.getByTestId("brief-notams-empty").textContent).toBe("None heard since 19 Oct");
    expect(document.body.textContent).not.toMatch(/no notams/i);
  });

  test("a NOTAM's raw text is folded under its name, as sent; a pinned one is first and a read one folds", () => {
    state.value = { shown: true, ...splitRanking(ANSWER), answer: ANSWER, error: null, pending: false };
    useNotamMarks.setState({ pinned: ["OSH 11/030"], read: ["OSH 11/012"] });
    render(<NotamRankingSection />);
    const lines = screen.getAllByTestId("brief-notam");
    expect(lines.map((l) => l.getAttribute("data-notam"))).toEqual(["OSH 11/030", "OSH 11/015", "ZAU 11/301"]);
    expect(screen.queryByTestId("brief-notam-raw")).toBeNull();
    fireEvent.click(screen.getAllByTestId("brief-notam-source")[1]!);
    expect(screen.getByTestId("brief-notam-raw").textContent).toBe("!OSH 11/015 RAW");
    fireEvent.click(screen.getByTestId("brief-notams-more"));
    expect(screen.getAllByTestId("brief-notam-folded").map((l) => l.getAttribute("data-notam"))).toEqual(["OSH 11/012", "C81 11/004"]);
  });

  test("what the filter leaves out is counted, and Show All brings it back", () => {
    state.value = { shown: true, ...splitRanking(ANSWER), answer: ANSWER, error: null, pending: false };
    useNotamMarks.setState({ filter: { ...ALL_NOTAMS, when: ["now"] } });
    render(<NotamRankingSection />);
    expect(screen.getByTestId("brief-notams-hidden").textContent).toContain("1 hidden by the filter");
    fireEvent.click(screen.getByTestId("brief-notams-show-all"));
    expect(screen.queryByTestId("brief-notams-hidden")).toBeNull();
  });
});
