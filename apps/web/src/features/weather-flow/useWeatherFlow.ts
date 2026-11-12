import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { data, planner } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";
import { prefersReducedMotion } from "../../lib/motion";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import type { ShownField } from "./flowLook";

export type FlowLayer = components["schemas"]["FlowLayer"];
export type FlowFrame = components["schemas"]["FlowFrame"];

/** How often the timeline is asked for again: the weather service looks
 *  for a new HRRR run four times an hour. */
const REFRESH_MS = 10 * 60_000;
/** How long each hour is shown while the timeline plays. */
const FRAME_MS = 1200;

/** A frame's picture of a field, as the planner serves it through the gateway. */
export const pictureUrl = (frame: FlowFrame, field: ShownField | "wind") => `/api/planner/weather/flow/${frame.id}/${field}.png`;

interface Player {
  /** The hour shown, an index into the frames; null follows now. */
  index: number | null;
  playing: boolean;
  /** Where the value bubble stands, [lon, lat]; null before the first tap. */
  point: [number, number] | null;
  /** Whether the pilot put the bubble there with a tap, rather than it
   *  standing where the map was when the layer came on. */
  tapped: boolean;
  /** The precipitation's span, as Apple Weather's precipitation map has
   *  it: the hour past, the radar's (1h), or the forecast hours (12h). */
  span: Span;
  set: (patch: Partial<Omit<Player, "set">>) => void;
}

export type Span = "1h" | "12h";

export const usePlayer = create<Player>()((set) => ({
  index: null,
  playing: false,
  point: null,
  tapped: false,
  span: "12h",
  set: (patch) => set(patch),
}));

/** The frame that is now: the newest whose hour has come. */
export function nowIndex(frames: FlowFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.past) return i;
  return 0;
}

/** A frame's hour as the bar says it: "Now", or how far ahead or back. */
export function hourName(frames: FlowFrame[], i: number): string {
  const now = nowIndex(frames);
  if (i === now) return "Now";
  const hours = Math.round((Date.parse(frames[i]!.valid) - Date.parse(frames[now]!.valid)) / 3_600_000);
  return hours > 0 ? `+${hours} h` : `${hours} h`;
}

/** The frames the timeline runs over, as indices: on the precipitation's
 *  1h span the hours already past (the last one and now), whose rain is
 *  the radar's where it has its mosaic; otherwise every frame. */
function windowOf(frames: FlowFrame[], field: string, span: Span): number[] {
  const all = frames.map((_, i) => i);
  if (field !== "precip" || span !== "1h") return all;
  const past = all.filter((i) => frames[i]!.past);
  return past.length ? past : all;
}

/**
 * The flow layer's timeline (the owner, 2026-11-11, Apple Weather's wind
 * map): the hours the planner lists (wingtip.weather_flow), the one shown
 * -- now until the pilot scrubs or plays -- and play, which steps through
 * the forecast hours once and stops on the last (WCAG 2.2.2), not by
 * itself and never under Reduce Motion, and pauses while the app is in
 * the background. `drive` is passed by the one component that runs the
 * clock (the bar).
 */
export function useWeatherFlow({ drive = false }: { drive?: boolean } = {}) {
  const field = useWeatherLayers((s) => s.flow);
  const query = useQuery({
    queryKey: ["weatherFlow"],
    queryFn: () => planner.GET("/api/weather/flow").then(data<FlowLayer>),
    enabled: field !== "off",
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    meta: { silent: true },
  });
  const frames = query.data?.frames ?? [];
  const { index, playing, span, set } = usePlayer();
  const shown = frames.length ? Math.min(index ?? nowIndex(frames), frames.length - 1) : -1;
  const steps = windowOf(frames, field, span);
  const first = steps[0] ?? 0;
  const last = steps[steps.length - 1] ?? 0;

  useEffect(() => {
    if (!drive || !playing) return;
    if (prefersReducedMotion()) {
      set({ playing: false });
      return;
    }
    const timer = setTimeout(() => {
      const next = shown + 1;
      set(next <= last ? { index: next } : { playing: false });
    }, FRAME_MS);
    return () => clearTimeout(timer);
  }, [drive, playing, shown, last, set]);

  // Paused in the background, as the loop is: nothing plays unseen.
  useEffect(() => {
    if (!drive) return;
    const hidden = () => {
      if (document.hidden) usePlayer.getState().set({ playing: false });
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [drive]);

  return {
    field,
    layer: query.data ?? null,
    frames,
    shown,
    frame: shown >= 0 ? frames[shown]! : null,
    playing,
    span,
    /** The frames the bar runs over (windowOf). */
    steps,
    loading: query.isPending && field !== "off",
    failed: !!query.error && !query.data,
    seek: (i: number) => set({ index: i, playing: false }),
    toggle: () => set({ playing: !playing, index: !playing && (shown >= last || shown < first) ? first : shown }),
    now: () => set({ index: null, playing: false }),
    /** The precipitation's span: now is in both, so it is where each starts. */
    pickSpan: (next: Span) => set({ span: next, index: null, playing: false }),
  };
}
