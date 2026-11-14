// @vitest-environment jsdom
/**
 * Fly Here's read-ahead as an airport's card opens (useFlyHere): the
 * checkpoints and the nav log of the route the tap would make, asked for
 * as reads ahead, and let go with their requests when the card closes
 * without the tap. The network is a mock; what is proved is what is asked
 * and what is stopped, not the planner's answers.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { queryClient } from "../../../lib/queryClient";
import { useFlyHere } from "./useFlyHere";

vi.mock("../../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/api/client")>()),
  api: { course: vi.fn(), checkpoints: vi.fn(), navlog: vi.fn() },
}));

const { api } = await import("../../../lib/api/client");

/** The signals each request was sent with, to see it stopped. */
let signals: AbortSignal[] = [];

beforeEach(() => {
  signals = [];
  vi.mocked(api.course).mockReturnValue(new Promise(() => {}));
  vi.mocked(api.checkpoints).mockImplementation((_dep, _dest, _stops, signal) => {
    if (signal) signals.push(signal);
    return new Promise(() => {});
  });
  // The nav log streams; this one never sends a line.
  vi.mocked(api.navlog).mockImplementation(async function* (...args: unknown[]) {
    signals.push(args[6] as AbortSignal);
    await new Promise(() => {});
    yield* [];
  } as typeof api.navlog);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

const props = (place: string | null) => ({
  planned: { dep: "KMSN", dest: "", stops: [] },
  place,
  depart: "",
  aircraft: { profile: "c172", label: "Cessna 172" },
  load: 0,
  setLoad: vi.fn(),
  showWaypoints: true,
  flightRules: "vfr" as const,
  setPanel: vi.fn(),
  setAddress: vi.fn(),
});

describe("Fly Here read ahead as a card opens", () => {
  test("asks for its route's checkpoints and nav log as reads ahead", async () => {
    renderHook((p: ReturnType<typeof props>) => useFlyHere(p), { initialProps: props("KOSH") });
    await waitFor(() => expect(api.navlog).toHaveBeenCalled());
    expect(api.course).toHaveBeenCalledWith("KMSN", "KOSH", [], expect.anything(), undefined);
    expect(api.checkpoints).toHaveBeenCalledWith("KMSN", "KOSH", [], expect.anything(), true, undefined);
    // Its `ahead`, before Start At: the planner's reads queued behind the pilot's.
    expect(vi.mocked(api.navlog).mock.calls[0]!.at(-2)).toBe(true);
  });

  test("stops them and lets them go as the card closes", async () => {
    const hook = renderHook((p: ReturnType<typeof props>) => useFlyHere(p), { initialProps: props("KOSH") });
    await waitFor(() => expect(signals).toHaveLength(2));
    act(() => hook.rerender(props(null)));
    await waitFor(() => expect(signals.every((s) => s.aborted)).toBe(true));
    expect(queryClient.getQueryCache().find({ queryKey: ["checkpoints-ahead", "KMSN", "KOSH", ""] })).toBeUndefined();
  });
});
