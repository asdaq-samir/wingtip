import { create } from "zustand";
import type { Keyframe, View } from "./keyframes";

/** The replay's cameras on the 3D view (ReplayCameraGl): behind the
 *  airplane, from its seat, round it, from a fixed point on the ground,
 *  and straight down. */
export type CameraKind = "chase" | "cockpit" | "orbit" | "tower" | "top";

export const CAMERAS: { value: CameraKind; label: string }[] = [
  { value: "chase", label: "Chase" },
  { value: "cockpit", label: "Cockpit" },
  { value: "orbit", label: "Orbit" },
  { value: "tower", label: "Tower" },
  { value: "top", label: "Top down" },
];

interface CameraState {
  kind: CameraKind | null;
  tower: { lat: number; lon: number } | null;
  /** The keyframes (keyframes.ts), and whether the camera follows them
   *  (it does once one is added; off, the menu's camera does). */
  keys: Keyframe[];
  keyed: boolean;
}

/**
 * Which camera follows the replay, and where the tower stands (null: the
 * flight's first report; TODO(claude/studio): a tap on the map to set it),
 * and the keyframes a video's camera moves by: one small store, so
 * whatever offers the menu (the Studio's bar, and in time Plan's dry run
 * and past flight) carries none of the 3D code, which loads with the 3D
 * view (TerrainGl). None (`kind` null, no keyframes followed): the map is
 * the pilot's to move, as it always was.
 */
export const useReplayCamera = create<CameraState>(() => ({ kind: null, tower: null, keys: [], keyed: false }));

export function setReplayCamera(kind: CameraKind | null) {
  useReplayCamera.setState({ kind });
}

let made = 0;

/** A keyframe at `t`: the camera picked, or where the map is now (`view`)
 *  where none is. One at the same second is replaced. */
export function addKeyframe(t: number, view: View | null) {
  useReplayCamera.setState((s) => {
    const kind = s.kind ?? (view ? "fixed" : null);
    if (!kind) return {};
    const key: Keyframe = { id: `k${++made}`, t, kind, fixed: kind === "fixed" ? view : null };
    const kept = s.keys.filter((k) => Math.round(k.t) !== Math.round(t));
    return { keys: [...kept, key].sort((a, b) => a.t - b.t), keyed: true };
  });
}

export function changeKeyframe(id: string, change: Partial<Pick<Keyframe, "t" | "kind">>) {
  useReplayCamera.setState((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...change } : k)).sort((a, b) => a.t - b.t) }));
}

export function removeKeyframe(id: string) {
  useReplayCamera.setState((s) => {
    const keys = s.keys.filter((k) => k.id !== id);
    return { keys, keyed: s.keyed && keys.length > 0 };
  });
}

export function followKeyframes(keyed: boolean) {
  useReplayCamera.setState((s) => ({ keyed: keyed && s.keys.length > 0 }));
}

/** Everything back as it was: the Studio left. */
export function resetReplayCamera() {
  useReplayCamera.setState({ kind: null, keys: [], keyed: false });
}
