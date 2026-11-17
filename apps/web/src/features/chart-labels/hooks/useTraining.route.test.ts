// @vitest-environment jsdom
/**
 * The network never runs here -- `api` is replaced with a mock, so what
 * each test actually proves is that the hook calls the right endpoint
 * with the right body and lays the response and the session's edits
 * over each other correctly, not that the real planner-service agrees.
 * That's still worth having: it's exactly the kind of bug a rename or
 * a dropped `await` produces, and this catches it without a browser or
 * a backend.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  courseFixture,
  detectionFixture,
  loosePickFixture,
  summary,
  streamOf,
  savedPickResponse,
  renderLabels,
  loaded,
} from "./trainingTestKit";
import type { StreamMessage } from "../../../lib/api/types";
import { useTraining } from "./useTraining";

vi.mock("../../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/api/client")>()),
  api: { course: vi.fn(), detect: vi.fn(), savePick: vi.fn(), deletePick: vi.fn(), classify: vi.fn() },
}));

const { api } = await import("../../../lib/api/client");
const mockCourse = vi.mocked(api.course);
const mockDetect = vi.mocked(api.detect);
const mockSavePick = vi.mocked(api.savePick);
const mockClassify = vi.mocked(api.classify);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTraining across routes and saves", () => {
  test("a new route starts clean: nothing of the previous route's edits or points is left behind", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], []));
    mockSavePick.mockResolvedValue(savedPickResponse(loosePickFixture({ rating: 3, rated: true })));

    const { result, rerender } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    await act(async () => {
      await result.current.rate(3);
    });
    expect(result.current.detections).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);

    mockDetect.mockReturnValue(streamOf([], []));
    rerender({ dep: "KDSM", dest: "KOMA" });
    await loaded(result);

    expect(result.current.detections).toHaveLength(0);
    expect(result.current.added).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  test("an address naming one airport twice asks for no chart read, though the old map stays up", async () => {
    // A disabled course query still hands back the previous route's
    // course as placeholder data; the chart read keyed only on that, and
    // asked the planner for a C81->C81 corridor.
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], []));
    const { result, rerender } = renderLabels();
    await loaded(result);

    rerender({ dep: "C81", dest: "C81" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockDetect).not.toHaveBeenCalledWith("C81", "C81", expect.anything());
    expect(mockDetect).toHaveBeenCalledTimes(1);
  });

  test("a point added while the chart is still being read stays the one selected when the read ends", async () => {
    // The read's own unclaimed picks arrive only with its last message,
    // and go in front of the points added by hand. The selection was a
    // position in that list, so it slid onto one of them, and the next
    // rating was saved to the wrong pick.
    mockCourse.mockResolvedValue(courseFixture());
    let finish!: () => void;
    const unclaimed = loosePickFixture({ lat: 45.5, lon: -91.5 });
    mockDetect.mockReturnValue(
      (async function* (): AsyncGenerator<StreamMessage> {
        yield { type: "block", block: 0, blocks: 2, tiles: 1, missing: 0, detections: [detectionFixture()] };
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        yield { type: "done", total: 2, added: [unclaimed], summary: { ...summary, added: 1 } };
      })(),
    );
    mockClassify.mockResolvedValue({ category: "road_or_rail" });
    mockSavePick.mockResolvedValue(savedPickResponse(loosePickFixture({ lat: 43.25, lon: -89.25, rating: 4, rated: true })));
    const { result } = renderLabels();
    await waitFor(() => expect(result.current.detections).toHaveLength(1));

    await act(async () => {
      await result.current.addPick(43.25, -89.25);
    });
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(result.current.added).toHaveLength(2));

    expect(result.current.selected).toMatchObject({ lat: 43.25, lon: -89.25 });
    await act(async () => {
      await result.current.rate(4);
    });
    expect(mockSavePick).toHaveBeenCalledWith(expect.objectContaining({ lat: 43.25, lon: -89.25, rating: 4 }));
  });

  test("left and come back to, the page reads the chart again rather than show a stale read", async () => {
    // The session's edits go with the component; a cached read shown
    // again had every rating since then missing.
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockImplementation(() => streamOf([detectionFixture()], []));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const first = renderHook(() => useTraining("C81", "KDLH"), { wrapper });
    await loaded(first.result);
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 10)); // leaving takes longer than a tick

    const again = renderHook(() => useTraining("C81", "KDLH"), { wrapper });
    await loaded(again.result);
    expect(mockDetect).toHaveBeenCalledTimes(2);
  });

  test("a point added by hand takes the planner's distances once it is saved", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([], []));
    mockClassify.mockResolvedValue({ category: "road_or_rail" });
    mockSavePick.mockResolvedValue(
      savedPickResponse(loosePickFixture({ lat: 43.25, lon: -89.25, rating: 3, rated: true, along_track_nm: 61.4, cross_track_nm: 0.3 })),
    );
    const { result } = renderLabels();
    await loaded(result);
    await act(async () => {
      await result.current.addPick(43.25, -89.25);
    });
    expect(result.current.added[0]!.along_track_nm).toBe(0);

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.added[0]).toMatchObject({ along_track_nm: 61.4, cross_track_nm: 0.3 });
  });

  test("a save that lands after the route has changed leaves the new route alone", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockImplementation(() => streamOf([detectionFixture()], []));
    let land!: () => void;
    mockSavePick.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () => resolve(savedPickResponse(loosePickFixture({ rating: 5, rated: true })));
        }),
    );
    const { result, rerender } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.rate(5);
    });

    rerender({ dep: "KDSM", dest: "KOMA" });
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    await act(async () => {
      land();
      await pending;
    });

    expect(result.current.selected).toBe(result.current.detections[0]);
    expect(result.current.detections[0]!.rating).toBeNull();
  });

  test("a rating that takes the place of a nearby pick shows that pick unrated, as the planner now holds it", async () => {
    // One pick per place, whatever each point is: rating the bridge took
    // the river's pick beside it, and the river still showed its rating.
    mockCourse.mockResolvedValue(courseFixture());
    const river = detectionFixture({ lat: 43, lon: -89, category: "river", rating: 4, rated: true });
    const bridge = detectionFixture({ lat: 43.0005, lon: -89, category: "road_or_rail" });
    mockDetect.mockReturnValue(streamOf([river, bridge], []));
    mockSavePick.mockResolvedValue(
      savedPickResponse(loosePickFixture({ lat: 43.0005, lon: -89, category: "road_or_rail", rating: 5, rated: true }), [
        { lat: 43, lon: -89, category: "river" },
      ]),
    );
    const { result } = renderLabels();
    await loaded(result);

    act(() => result.current.select(result.current.detections[1]!));
    await act(async () => {
      await result.current.rate(5);
    });

    expect(result.current.detections[0]).toMatchObject({ category: "river", rating: null, rated: false });
    expect(result.current.detections[1]).toMatchObject({ rating: 5, rated: true });
  });

  test("two features read at one place are one point, the first, and selecting it selects that one", async () => {
    // A road over a river came back as two detections on one centroid.
    // Both were listed under the one key, so the later always won the
    // selection and the keys could not walk past the pair.
    mockCourse.mockResolvedValue(courseFixture());
    const road = detectionFixture({ lat: 42.3745247, lon: -88.116188, category: "road_or_rail" });
    const river = detectionFixture({ lat: 42.3745247, lon: -88.116188, category: "river" });
    const lake = detectionFixture({ category: "lake_or_pond", along_track_nm: 30 });
    mockDetect.mockReturnValue(streamOf([road, river, lake], []));
    const { result } = renderLabels();
    await loaded(result);

    expect(result.current.detections.map((d) => d.category)).toEqual(["road_or_rail", "lake_or_pond"]);
    act(() => result.current.select(result.current.detections[0]!));
    expect(result.current.selected).toBe(result.current.detections[0]);
  });
});
