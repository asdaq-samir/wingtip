import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../../lib/api/client";
import { prefersReducedMotion } from "../../lib/motion";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { dwellMs, nextFrame } from "./loopFrames";

/** How often the frames are asked for again: half the radar's five
 *  minutes, so a new mosaic is in the loop within a few minutes of IEM's. */
const REFRESH_MS = 150_000;

/**
 * Where the loop is, shared by the map's layers (WeatherLoopGl), which
 * say when the frames have loaded, and the bar (LoopBar), which plays
 * and scrubs them. `index` null follows the newest frame, so a refresh
 * that adds one shows it.
 */
interface Player {
  index: number | null;
  playing: boolean;
  /** The frames' tiles in view have loaded (or the preload's cap passed). */
  ready: boolean;
  /** Played once by itself for this loop: Reduce Motion, or a pause by
   *  the pilot, is not undone by the next refresh. */
  started: boolean;
  /** Playing when the app went to the background, to go on with on return. */
  resume: boolean;
  set: (patch: Partial<Omit<Player, "set">>) => void;
}

const usePlayer = create<Player>()((set) => ({
  index: null,
  playing: false,
  ready: false,
  started: false,
  resume: false,
  set: (patch) => set(patch),
}));

/**
 * The radar and satellite loop on the map (the owner, 2026-11-09): the
 * frames the planner lists for the pick in the Map menu (wingtip.
 * weather_loop), the one shown, and play, pause and scrub. The bar passes
 * `drive`, and runs the clock: it plays once the frames have loaded --
 * not before, so nothing flickers in -- and not by itself under Reduce
 * Motion, which shows the newest frame still; it pauses while the app is
 * in the background and goes on when it is back.
 */
export function useWeatherLoop({ drive = false }: { drive?: boolean } = {}) {
  const kind = useWeatherLayers((s) => s.loop);
  const speed = useWeatherLayers((s) => s.loopSpeed);
  const { data, error, isPending, dataUpdatedAt } = useQuery({
    queryKey: ["weatherLoop", kind],
    queryFn: () => api.weatherLoop(kind === "off" ? "radar" : kind),
    enabled: kind !== "off",
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    meta: { silent: true },
  });
  const frames = data?.frames ?? [];
  const { index, playing, ready, started, set } = usePlayer();
  const shown = frames.length ? Math.min(index ?? frames.length - 1, frames.length - 1) : -1;

  // A new pick starts afresh: the newest frame, loading.
  useEffect(() => {
    if (drive) usePlayer.getState().set({ index: null, playing: false, ready: false, started: false, resume: false });
  }, [drive, kind]);

  // Played by itself once loaded, unless the pilot asked for less motion.
  useEffect(() => {
    if (!drive || !ready || started || frames.length < 2) return;
    set({ started: true, playing: !prefersReducedMotion(), index: prefersReducedMotion() ? null : 0 });
  }, [drive, ready, started, frames.length, set]);

  // The clock: each frame for its dwell, the newest held a little longer.
  useEffect(() => {
    if (!drive || !playing || !ready || frames.length < 2) return;
    const timer = setTimeout(() => set({ index: nextFrame(shown, frames.length) }), dwellMs(shown, frames.length, speed));
    return () => clearTimeout(timer);
  }, [drive, playing, ready, shown, frames.length, speed, set]);

  // Paused in the background, and on again on return if it was playing.
  useEffect(() => {
    if (!drive) return;
    const onVisibility = () => {
      const s = usePlayer.getState();
      if (document.hidden) s.set({ resume: s.playing, playing: false });
      else if (s.resume) s.set({ resume: false, playing: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [drive]);

  return {
    kind,
    speed,
    frames,
    shown,
    frame: shown >= 0 ? frames[shown] : undefined,
    playing,
    ready,
    loading: kind !== "off" && isPending,
    failed: !!error && !data,
    /** When the frame list shown came, and whether asking again failed:
     *  its age where it is the one kept (KeptAge). */
    fetchedAt: dataUpdatedAt || null,
    refreshFailed: !!error,
    oldAfterS: data?.old_after_s ?? 900,
    credit: data?.credit ?? "",
    toggle: () => set({ playing: !playing, started: true, resume: false }),
    seek: (i: number) => set({ index: i, playing: false, started: true, resume: false }),
    setReady: (on: boolean) => set({ ready: on }),
  };
}
