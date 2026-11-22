import { useEffect } from "react";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePastFlight } from "../../../lib/replay/clock";
import { useReplayCamera } from "../../../lib/replay/camera/cameraStore";
import { replayView, showView } from "./cameraView";

/** How close in a camera may come: its height, not the chart, sets it
 *  (PilotCamera's). */
const CAMERA_MAX_ZOOM = 18;

/**
 * The replay's camera on the 3D view (TerrainGl mounts it): the camera
 * picked (useReplayCamera), moved each frame to where the replay's
 * airplane is (the map's one replay clock, usePastFlight; cameraView's
 * replayView), as the pilot's view moves its own; idle with none picked.
 * Own ship's following is let go while it runs and given back after. In a gap the camera holds where it was: the airplane is not
 * known to have been anywhere.
 */
export default function ReplayCameraGl() {
  const { map } = useGlMap();
  const kind = useReplayCamera((s) => s.kind);
  const active = kind !== null;
  useEffect(() => {
    if (!active) return;
    const wasFollow = useOwnShip.getState().follow;
    useOwnShip.getState().setFollow(false);
    const maxZoom = map.getMaxZoom();
    map.setMaxZoom(CAMERA_MAX_ZOOM);
    const el = map.getContainer();
    let frame = 0,
      shownAt: number | null = null;
    // Another camera picked: shown again.
    const unsubscribe = useReplayCamera.subscribe(() => (shownAt = null));
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const cam = useReplayCamera.getState();
      el.dataset.replayCamera = cam.kind ?? "";
      const { at } = usePastFlight.getState();
      // The orbit goes round by itself; the rest move only with the replay.
      const turning = cam.kind === "orbit";
      if (at === null || (at === shownAt && !turning)) return;
      const view = replayView(map, at, now / 1000);
      if (!view) return;
      shownAt = at;
      showView(map, view);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      delete el.dataset.replayCamera;
      if (!map.style) return;
      map.setMaxZoom(maxZoom);
      useOwnShip.getState().setFollow(wasFollow);
    };
  }, [map, active]);
  return null;
}
