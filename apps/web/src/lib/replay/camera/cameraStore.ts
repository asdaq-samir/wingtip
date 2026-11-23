import { create } from "zustand";
/** The replay's cameras on the 3D view (ReplayCameraGl): behind the
 *  airplane, from its seat, round it, from a fixed point on the ground,
 *  and straight down. */
export type CameraKind = "chase" | "cockpit" | "orbit" | "tower" | "top";

/** Where the map's camera is, as MapLibre's jumpTo takes it. */
export interface View {
  lon: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

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
}

/**
 * Which camera follows the replay, and where the tower stands (null: the
 * flight's first report): one small store, so whatever offers the menu
 * (a past flight's card) carries none of the 3D code, which loads with
 * the 3D view (TerrainGl). None (`kind` null): the map is the pilot's to
 * move, as it always was.
 */
export const useReplayCamera = create<CameraState>(() => ({ kind: null, tower: null }));

export function setReplayCamera(kind: CameraKind | null) {
  useReplayCamera.setState({ kind });
}
