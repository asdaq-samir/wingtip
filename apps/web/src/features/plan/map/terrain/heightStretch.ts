import { usePreferences, type HeightStretch } from "../../../../lib/preferences";
import { useReplayCamera } from "../../../replay/camera/cameraStore";
import { useTerrainView } from "./useTerrainView";

/**
 * The stretch the 3D view draws its heights at: the pilot's Heights (lib/
 * prefs' HeightStretch), but true height (×1) while the dry run is seen
 * from the pilot's seat (PilotCamera) or a replay camera follows the
 * airplane (ReplayCameraGl). A view from the airplane is read for its
 * clearance over the ground, and a mountain stood up three times there
 * would mislead; the Heights picked come back as the view ends, as the
 * preference is never changed.
 */
export function drawnStretch(chosen: HeightStretch, trueView: boolean): HeightStretch {
  return trueView ? 1 : chosen;
}

/** Which view keeps the heights true now, if any: the pilot's or a replay
 *  camera's (the Map card's Heights says so under it). */
export function useTrueHeightView(): "pilot" | "replay" | null {
  const { pilot } = useTerrainView();
  const replay = useReplayCamera((s) => s.kind !== null || s.keyed);
  return pilot ? "pilot" : replay ? "replay" : null;
}

/** drawnStretch for the 3D view's layers, from the preference and the views. */
export function useDrawnStretch(): HeightStretch {
  const chosen = usePreferences((s) => s.heightStretch);
  return drawnStretch(chosen, useTrueHeightView() !== null);
}
