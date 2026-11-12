import { useEffect } from "react";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePastFlight } from "../../../lib/replay/clock";
import { useExporting } from "../export/exportStore";
import { useReplayCamera } from "./cameraStore";
import { replayView, showView } from "./cameraView";

/** How close in a camera may come: its height, not the chart, sets it
 *  (PilotCamera's). */
const CAMERA_MAX_ZOOM = 18;

/**
 * The replay's camera on the 3D view (TerrainGl mounts it): the camera
 * picked (useReplayCamera), or the keyframes where they are followed,
 * moved each frame to where the replay's airplane is (the map's one
 * replay clock, usePastFlight; cameraView's replayView, which a video's
 * export takes each frame too), as the pilot's view moves its own; idle
 * with none picked; still while a video is rendered, which moves the
 * camera itself. Own ship's following is let go while it runs and given back
 * after. In a gap the camera holds where it was: the airplane is not
 * known to have been anywhere.
 *
 * TODO(claude/studio): the pilot's view (PilotCamera, the dry run's) to
 * take its pose from poseOf("cockpit") -- the same figures, kept in step
 * by hand till then -- once the 3D agents' branches have landed; it keeps
 * its ground colours of its own.
 */
export default function ReplayCameraGl() {
  const { map } = useGlMap();
  const kind = useReplayCamera((s) => s.kind);
  const keyed = useReplayCamera((s) => s.keyed);
  const active = kind !== null || keyed;
  useEffect(() => {
    if (!active) return;
    const wasFollow = useOwnShip.getState().follow;
    useOwnShip.getState().setFollow(false);
    const maxZoom = map.getMaxZoom();
    map.setMaxZoom(CAMERA_MAX_ZOOM);
    const el = map.getContainer();
    let frame = 0,
      shownAt: number | null = null;
    // A keyframe added or changed, or another camera picked: shown again.
    const unsubscribe = useReplayCamera.subscribe(() => (shownAt = null));
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const cam = useReplayCamera.getState();
      el.dataset.replayCamera = cam.keyed ? "keyframes" : (cam.kind ?? "");
      const { at } = usePastFlight.getState();
      if (useExporting.getState().running) return;
      // The orbit goes round by itself; the rest move only with the replay.
      const turning = cam.kind === "orbit" || (cam.keyed && cam.keys.some((k) => k.kind === "orbit"));
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
