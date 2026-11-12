import { pausePastFlight, playPastFlight, usePastFlight, type ReplayPoint } from "../../lib/replay/clock";

/** The Studio's speeds, a quarter to sixteen times as flown: slow enough
 *  to watch a flare, quick enough to cross a cross-country. */
export const STUDIO_SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

/** A speed as the menu says it: "¼×", "16×". */
export function speedName(x: number): string {
  if (x === 0.25) return "¼×";
  if (x === 0.5) return "½×";
  return `${x}×`;
}

/** Play or pause, from where it was left (the map's one replay clock). */
export function toggleReplay() {
  if (usePastFlight.getState().playing) pausePastFlight();
  else playPastFlight();
}

/** The replay put at `t`, inside the flight. */
function seekReplay(t: number) {
  usePastFlight.setState((s) => {
    const first = s.points[0]?.t,
      last = s.points.at(-1)?.t;
    if (first === undefined || last === undefined) return {};
    return { at: Math.min(last, Math.max(first, t)) };
  });
}

function setReplaySpeed(speed: number) {
  usePastFlight.setState({ speed });
}

/** A track handed to the clock, from its start, paused: the Studio's
 *  (`id` its own, so the dry run and a past flight know it is not theirs). */
export function loadReplay(id: string, points: ReplayPoint[], speed = 1) {
  usePastFlight.setState({ hex: id, id: null, points, at: points[0]?.t ?? null, playing: false, speed, stops: [] });
}

/**
 * The view model of a replay's timeline, one for every replay: the
 * moment (`at`, s; null before it has been played), whether it plays and
 * how fast, the flight's start and end, and the actions. Over the map's
 * one replay clock (usePastFlight), which the map's airplane (ReplayGl)
 * steps and the cameras (features/replay/camera) and the pilot's view
 * read; the dry run, a past flight and the Studio all play on it.
 * `second` is the moment to the whole second, which is what a view
 * redraws on; the 3D cameras read the clock each frame themselves.
 */
export function useReplay() {
  const second = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at)));
  const playing = usePastFlight((s) => s.playing);
  const speed = usePastFlight((s) => s.speed);
  const start = usePastFlight((s) => s.points[0]?.t ?? null);
  const end = usePastFlight((s) => s.points.at(-1)?.t ?? null);
  return {
    second,
    playing,
    speed,
    start,
    end,
    ready: start !== null && end !== null && end > start,
    toggle: toggleReplay,
    seek: seekReplay,
    setSpeed: setReplaySpeed,
  };
}
