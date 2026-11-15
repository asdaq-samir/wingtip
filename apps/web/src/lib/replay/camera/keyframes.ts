import type { CameraKind } from "./cameraStore";

/** Where the map's camera is, as MapLibre's jumpTo takes it. */
export interface View {
  lon: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/**
 * A camera keyframe: at a moment of the replay (s since 1970), one of the
 * replay's cameras (following the airplane, cameraPose), or a view set by
 * hand and held (`fixed`). Between two keyframes the camera eases from the
 * one's view to the other's, both worked out at each moment, so a move
 * from the chase to the tower follows the airplane all the way. Thin, on
 * the existing cameras: theatre.js, the obvious library, has stalled since
 * 2024.
 */
export interface Keyframe {
  id: string;
  t: number;
  kind: CameraKind | "fixed";
  /** The view held, for a fixed keyframe; null otherwise. */
  fixed: View | null;
}

/** Ease in and out (the cubic smoothstep): a move starts and ends at rest,
 *  as a camera operator's does. */
export const ease = (f: number) => {
  const x = Math.min(1, Math.max(0, f));
  return x * x * (3 - 2 * x);
};

/** The view `f` of the way from `a` to `b`, the bearing the short way
 *  round. */
export function blendView(a: View, b: View, f: number): View {
  const mix = (x: number, y: number) => x + (y - x) * f;
  const turn = ((((b.bearing - a.bearing) % 360) + 540) % 360) - 180;
  return {
    lon: mix(a.lon, b.lon),
    lat: mix(a.lat, b.lat),
    zoom: mix(a.zoom, b.zoom),
    bearing: (a.bearing + turn * f + 360) % 360,
    pitch: mix(a.pitch, b.pitch),
  };
}

/**
 * The camera's view at `t` from the keyframes (in any order): the first's
 * before it, the last's after it, and between two the ease from one to
 * the next. `viewOf` works out a keyframe's view at `t` (null where its
 * camera has nothing to follow, as in a gap: the other's is held then).
 */
export function keyedView(keys: Keyframe[], t: number, viewOf: (key: Keyframe) => View | null): View | null {
  if (!keys.length) return null;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const next = sorted.findIndex((k) => k.t > t);
  if (next === 0) return viewOf(sorted[0]!);
  if (next === -1) return viewOf(sorted.at(-1)!);
  const a = sorted[next - 1]!,
    b = sorted[next]!;
  const va = viewOf(a),
    vb = viewOf(b);
  if (!va || !vb) return va ?? vb;
  return blendView(va, vb, ease((t - a.t) / (b.t - a.t)));
}
