import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../../lib/api/client";
import { prefersReducedMotion } from "../../lib/motion";
import { usePauseWhileHidden } from "../../lib/usePauseWhileHidden";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { dwellMs, firstPlay, nextInPass, playFrom } from "./loopFrames";

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
  /** The frame a mouse rests over on the scrubber, shown on the map while
   *  it does (docs/design/web.md §7, desktop only); null with none. */
  peek: number | null;
  set: (patch: Partial<Omit<Player, "set">>) => void;
}

const usePlayer = create<Player>()((set) => ({
  index: null,
  playing: false,
  ready: false,
  started: false,
  peek: null,
  set: (patch) => set(patch),
}));

/**
 * The radar and satellite loop on the map (the owner, 2026-11-09): the
 * frames the planner lists for the pick in the Map menu (wingtip.
 * weather_loop), the one shown, and play, pause and scrub. The bar passes
 * `drive`, and runs the clock: it plays once through when the frames have
 * loaded -- not before, so nothing flickers in -- and stops on the newest
 * (WCAG 2.2.2); not by itself under Reduce Motion, which shows the newest
 * frame still; it pauses while the app is in the background and goes on
 * when it is back.
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
  const { index, playing, ready, started, peek, set } = usePlayer();
  const shown = frames.length ? Math.min(index ?? frames.length - 1, frames.length - 1) : -1;
  // What the map shows: the frame under the mouse on the scrubber, else the loop's.
  const showing = peek !== null && peek < frames.length ? peek : shown;

  // A new pick starts afresh: the newest frame, loading.
  useEffect(() => {
    if (drive) usePlayer.getState().set({ index: null, playing: false, ready: false, started: false, peek: null });
  }, [drive, kind]);

  // Played by itself once loaded, unless the pilot asked for less motion.
  useEffect(() => {
    if (!drive || !ready || started || frames.length < 2) return;
    set({ started: true, ...firstPlay(prefersReducedMotion()) });
  }, [drive, ready, started, frames.length, set]);

  // The clock: each frame for its dwell, one pass, stopped on the newest,
  // which is then followed (index null) so a refresh's new frame shows.
  useEffect(() => {
    if (!drive || !playing || !ready || frames.length < 2) return;
    const next = nextInPass(shown, frames.length);
    if (next === null) {
      set({ playing: false, index: null });
      return;
    }
    const timer = setTimeout(() => set({ index: next }), dwellMs(speed));
    return () => clearTimeout(timer);
  }, [drive, playing, ready, shown, frames.length, speed, set]);

  // Paused in the background, and on again on return if it was playing.
  usePauseWhileHidden(drive, usePlayer);

  return {
    kind,
    speed,
    frames,
    shown,
    frame: shown >= 0 ? frames[shown] : undefined,
    showing,
    /** The frame a mouse rests over on the scrubber, or null as it leaves. */
    peekAt: (i: number | null) => {
      if (usePlayer.getState().peek !== i) set({ peek: i });
    },
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
    /** Play a pass (from the oldest frame where it stands on the newest),
     *  or pause where it is. */
    toggle: () =>
      set(playing ? { playing: false, started: true } : { playing: true, index: playFrom(shown, frames.length), started: true }),
    seek: (i: number) => set({ index: i, playing: false, started: true }),
    /** The newest frame, followed from then on, the loop paused (the bar's Now). */
    now: () => set({ index: null, playing: false, started: true }),
    setReady: (on: boolean) => set({ ready: on }),
  };
}
