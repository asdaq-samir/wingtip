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
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { StreamMessage } from "../../../lib/api/types";
import {
  courseFixture,
  detectionFixture,
  loosePickFixture,
  streamOf,
  savedPickResponse,
  deletedResponse,
  renderLabels,
  loaded,
} from "./trainingTestKit";

vi.mock("../../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/api/client")>()),
  api: { course: vi.fn(), detect: vi.fn(), savePick: vi.fn(), deletePick: vi.fn(), classify: vi.fn() },
}));

const { api } = await import("../../../lib/api/client");
const mockCourse = vi.mocked(api.course);
const mockDetect = vi.mocked(api.detect);
const mockSavePick = vi.mocked(api.savePick);
const mockDeletePick = vi.mocked(api.deletePick);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTraining", () => {
  test("fetches the course, then streams detections and added picks in", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], [loosePickFixture()]));

    const { result } = renderLabels();
    await loaded(result);

    expect(mockCourse).toHaveBeenCalledWith("C81", "KDLH", [], expect.any(AbortSignal), undefined);
    expect(result.current.course?.departure.ident).toBe("C81");
    expect(result.current.endpoints).toHaveLength(2);
    expect(result.current.detections).toHaveLength(1);
    expect(result.current.added).toHaveLength(1);
  });

  test("a failed course fetch is an error to show, not a thrown exception", async () => {
    mockCourse.mockRejectedValue(new Error("no such airport"));

    const { result } = renderLabels({ dep: "ZZZZ", dest: "KDLH" });
    await waitFor(() => expect(result.current.error).toBe("no such airport"));
    expect(result.current.loading).toBe(false);
  });

  test("keeps what arrived and shows the error line when the chart read fails part-way", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    async function* failing(): AsyncGenerator<StreamMessage> {
      yield { type: "block", block: 0, blocks: 4, tiles: 1, missing: 0, detections: [detectionFixture()] };
      yield { type: "error", detail: "corridor detection failed: tile fetch failed" };
    }
    mockDetect.mockReturnValue(failing());

    const { result } = renderLabels();
    await waitFor(() => expect(result.current.error).toBe("corridor detection failed: tile fetch failed"));
    expect(result.current.detections).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  test("does not stay loading when the stream stops without done or error", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    async function* truncated(): AsyncGenerator<StreamMessage> {
      yield { type: "start", route: "c81_kdlh" };
    }
    mockDetect.mockReturnValue(truncated());

    const { result } = renderLabels();
    await waitFor(() => expect(result.current.error).toMatch(/ended before it was finished/));
    expect(result.current.loading).toBe(false);
  });

  test("rate saves the pick and marks the selected detection rated", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], []));
    mockSavePick.mockResolvedValue(savedPickResponse(loosePickFixture({ rating: 5, rated: true, role: "dr" })));

    const { result } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    await act(async () => {
      await result.current.rate(5);
    });

    expect(mockSavePick).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, source: "detected" }));
    expect(result.current.detections[0]!.rating).toBe(5);
    expect(result.current.detections[0]!.rated).toBe(true);
    expect(result.current.canUndo).toBe(true);
  });

  test("a rate that fails to save changes nothing on screen, and leaves nothing to undo", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], []));
    mockSavePick.mockRejectedValue(new Error("network error"));

    const { result } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    const kept = await act(() => result.current.rate(5));

    // Not kept: the page stays and the card says so (WEB-37); the point is
    // still unrated, with nothing real to step back to, unlike an undo.
    expect([kept, result.current.rateFailed]).toEqual([false, true]);
    expect(result.current.detections[0]!.rating).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  test("undo reverts the most recent rate on a previously-unrated point", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture()], []));
    mockSavePick.mockResolvedValue(savedPickResponse(loosePickFixture({ rating: 3, rated: true })));
    mockDeletePick.mockResolvedValue(deletedResponse);

    const { result } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.detections[0]!));
    await act(async () => {
      await result.current.rate(3);
    });
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });

    // It had no rating before this rate() call, so undoing takes the
    // pick back off the server rather than restoring an earlier one.
    expect(mockDeletePick).toHaveBeenCalledTimes(1);
    expect(result.current.detections[0]!.rating).toBeNull();
    expect(result.current.detections[0]!.rated).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  test("removeSelected deletes an added point outright, and undo puts it back", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    const pick = loosePickFixture({ rating: 4, rated: true });
    mockDetect.mockReturnValue(streamOf([], [pick]));
    mockDeletePick.mockResolvedValue(deletedResponse);
    mockSavePick.mockResolvedValue(savedPickResponse(pick));

    const { result } = renderLabels();
    await loaded(result);
    act(() => result.current.select(result.current.added[0]!));
    await act(async () => {
      await result.current.removeSelected();
    });

    expect(result.current.added).toHaveLength(0);
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });

    // It had a rating before deletion, so undo re-persists the pick as
    // well as putting it back in the list, selected again.
    expect(mockSavePick).toHaveBeenCalledWith(expect.objectContaining({ rating: 4 }));
    expect(result.current.added).toHaveLength(1);
    expect(result.current.added[0]!.rating).toBe(4);
    expect(result.current.selected).toBe(result.current.added[0]);
  });

  test("resetAll deletes every rated pick and clears the added list", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(
      streamOf(
        [detectionFixture({ rating: 5, rated: true }), detectionFixture({ lat: 44, rating: null })],
        [loosePickFixture({ rating: 2, rated: true })],
      ),
    );
    mockDeletePick.mockResolvedValue(deletedResponse);

    const { result } = renderLabels();
    await loaded(result);
    await act(async () => {
      await result.current.resetAll();
    });

    // Two rated picks in the fixture (one detection, one added) -- the
    // unrated detection never had a server-side pick, so it costs no call.
    expect(mockDeletePick).toHaveBeenCalledTimes(2);
    expect(result.current.added).toHaveLength(0);
    expect(result.current.detections.every((d) => d.rating === null)).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  test("a resetAll that fails to delete leaves the ratings as they were", async () => {
    mockCourse.mockResolvedValue(courseFixture());
    mockDetect.mockReturnValue(streamOf([detectionFixture({ rating: 5, rated: true })], []));
    mockDeletePick.mockRejectedValue(new Error("server unavailable"));

    const { result } = renderLabels();
    await loaded(result);
    await act(async () => {
      await result.current.resetAll();
    });

    // The delete never landed, so the rating is left exactly as it was
    // rather than clearing it locally out of step with the server.
    expect(result.current.detections[0]!.rating).toBe(5);
  });
});
