// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TripLeg, TripMessage, TripProposal } from "../../lib/api/types";
import { useAsk } from "../../lib/ask/useAsk";
import { TooltipProvider } from "../../components/ui/tooltip";
import TripPlanner from "./TripPlanner";
import { changeOf, step } from "./useTripPlanner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAsk.setState({ applyChange: null });
});

const leg = (kind: "outbound" | "return", dep: string, dest: string, depart: string, arrive: string): TripLeg => ({
  kind,
  change: { dep, dest, stops: ["KUES"], altitude_ft: 4500, depart },
  altitude_ft: 4500,
  distance_nm: 113,
  ete_min: 74,
  fuel_gal: 11.2,
  arrive,
  depart_local: "",
  arrive_local: "",
  window: null,
  airspace: [],
  cautions: [],
  sources: [`plan:${dep}-${dest}-KUES`],
});

/** The stubbed Oshkosh trip, as services/assistant/tests/fixtures/trip_conversation.json proposes it. */
const PROPOSAL: TripProposal = {
  legs: [
    leg("outbound", "C81", "KOSH", "2026-11-14T14:00:00Z", "2026-11-14T15:14:00Z"),
    leg("return", "KOSH", "C81", "2026-11-14T20:30:00Z", "2026-11-14T21:40:00Z"),
  ],
  rationale: "West through Waukesha keeps you out of the Chicago Class B.",
  unmet: ["The app has no fuel prices: no fuel price feed is read, so a price limit cannot be applied."],
};

const STREAM: TripMessage[] = [
  { type: "tool", name: "route_options", label: "The ways to KOSH" },
  { type: "text", text: "Through Waukesha both ways keeps you clear of the Chicago Class B." },
  { type: "plan", proposal: PROPOSAL },
  { type: "sources", sources: [{ id: "plan:C81-KOSH-KUES", label: "The plan C81 to KOSH via KUES", text: "113 nm" }] },
  { type: "done" },
];

describe("the trip planner", () => {
  test("a leg loads as the route box's change, its altitude only where there is one", () => {
    expect(changeOf(PROPOSAL.legs[0]!)).toEqual({
      dep: "C81",
      dest: "KOSH",
      stops: ["KUES"],
      altitude_ft: 4500,
      depart: "2026-11-14T14:00:00Z",
    });
    const none = { ...PROPOSAL.legs[0]!, change: { ...PROPOSAL.legs[0]!.change, altitude_ft: null } };
    expect(changeOf(none)).not.toHaveProperty("altitude_ft");
  });

  test("the stream folds into the words, the proposal and its sources", () => {
    const start = { asked: "x", status: null, words: "", proposal: null, sources: [], error: null, busy: true, used: [] };
    const end = STREAM.reduce(step, start);
    expect(end.proposal).toBe(PROPOSAL);
    expect(end.words).toContain("Waukesha");
    expect(end.busy).toBe(false);
    expect(step(start, { type: "error", words: "The planner declined this trip." }).error).toBe("The planner declined this trip.");
  });

  test("the proposal shows each leg and what it could not meet, and Use loads a leg only on the tap", async () => {
    const body = STREAM.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const fetched = vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    vi.stubGlobal("fetch", fetched);
    const applyChange = vi.fn();
    useAsk.setState({ applyChange });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <TripPlanner onClose={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("trip-field"), { target: { value: "VFR to Oshkosh Saturday morning, back by 5" } });
    fireEvent.click(screen.getByTestId("trip-send"));
    await waitFor(() => expect(screen.getAllByTestId("trip-leg")).toHaveLength(2));
    const sent = JSON.parse((fetched.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.text).toBe("VFR to Oshkosh Saturday morning, back by 5");
    expect(typeof sent.time_zone).toBe("string");
    expect(screen.getAllByTestId("trip-route").map((r) => r.textContent)).toEqual(["C81 → KUES → KOSH", "KOSH → KUES → C81"]);
    expect(screen.getByTestId("trip-unmet").textContent).toContain("no fuel prices");
    expect(applyChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTestId("trip-use")[0]!);
    expect(applyChange).toHaveBeenCalledWith(changeOf(PROPOSAL.legs[0]!));
    expect(screen.getAllByTestId("trip-use")[0]!.textContent).toBe("Loaded");
    expect(screen.getAllByTestId("trip-use")[1]!.textContent).toBe("Use return leg");
  });
});
