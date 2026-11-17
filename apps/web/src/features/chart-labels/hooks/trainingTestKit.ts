/** What the useTraining tests share: the fixtures the planner's answers are
 *  made of, and the hook rendered with a client of its own. The `api` mock
 *  itself is each test file's, as the mock is hoisted within the file. */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { expect } from "vitest";
import type { Course, Detection, LoosePick, StreamMessage } from "../../../lib/api/types";
import { useTraining } from "./useTraining";

export function courseFixture(): Course {
  return {
    departure: { ident: "C81", name: "Campbell", lat: 42.1, lon: -88.1, elevation_ft: 890, kind: "airport" },
    destination: { ident: "KDLH", name: "Duluth", lat: 46.8, lon: -92.2, elevation_ft: 1428, kind: "airport" },
    stops: [],
    distance_nm: 323.4,
    bearing_deg: 328,
    course_line: [
      [42.1, -88.1],
      [46.8, -92.2],
    ],
    checkpoints_ready: false,
    max_zoom: 12,
    min_zoom: 4,
    chart_cycle: "09-03-2026",
    chart_revision: 0,
    chart_tiles_base: null,
    chart_layers: [],
  };
}

export function detectionFixture(over: Partial<Detection> = {}): Detection {
  return {
    lat: 43,
    lon: -89,
    category: "river",
    area_m2: 500,
    score: 4,
    predicted_score: null,
    along_track_nm: 25,
    cross_track_nm: 0,
    rating: null,
    role: null,
    rated: false,
    ...over,
  };
}

export function loosePickFixture(over: Partial<LoosePick> = {}): LoosePick {
  return {
    lat: 43.5,
    lon: -89.5,
    category: "road_or_rail",
    role: "dr",
    source: "added",
    rating: null,
    rated: false,
    along_track_nm: 40,
    cross_track_nm: 0,
    area_m2: 0,
    route: "c81_kdlh",
    note: null,
    created_at: null,
    ...over,
  };
}

export const summary = { total: 0, accepted: 0, rejected: 0, added: 0, by_rating: {}, by_role: { dr: 0, visual: 0 }, added_categories: [] };

/** One block of detections, then done -- the shape the stream
 *  actually carries. */
export async function* streamOf(detections: Detection[], added: LoosePick[]): AsyncGenerator<StreamMessage> {
  yield { type: "block", block: 0, blocks: 1, tiles: 1, missing: 0, detections };
  yield { type: "done", total: detections.length + added.length, added, summary: { ...summary, added: added.length } };
}

export const savedPickResponse = (pick: LoosePick, displaced: { lat: number; lon: number; category: string }[] = []) => ({
  ok: true,
  pick,
  summary,
  displaced,
});
export const deletedResponse = { ok: true, summary };

export function renderLabels(initialProps = { dep: "C81", dest: "KDLH" }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(({ dep, dest }: { dep: string; dest: string }) => useTraining(dep, dest), { wrapper, initialProps });
}

/** The course fetched and the chart read through, or failed. */
export async function loaded(result: { current: { loading: boolean } }) {
  await waitFor(() => expect(result.current.loading).toBe(false));
}
