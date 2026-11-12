import { useEffect } from "react";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { positionAt, usePastFlight } from "../../../lib/replay/clock";
import { poseOf } from "./cameraPose";
import { useReplayCamera } from "./cameraStore";

/** How close in a camera may come: its height, not the chart, sets it
 *  (PilotCamera's). */
const CAMERA_MAX_ZOOM = 18;

/**
 * The replay's camera on the 3D view (TerrainGl mounts it): the camera
 * picked (useReplayCamera) moved each frame to where the replay's
 * airplane is (the map's one replay clock, usePastFlight), as the pilot's
 * view moves its own; idle with none picked. Own ship's following is let
 * go while it runs and given back after. In a gap the camera holds where
 * it was: the airplane is not known to have been anywhere.
 *
 * TODO(claude/studio): the pilot's view (PilotCamera, the dry run's) to
 * take its pose from poseOf("cockpit") -- the same figures, kept in step
 * by hand till then -- once the 3D agents' branches have landed; it keeps
 * its ground colours of its own.
 */
export default function ReplayCameraGl() {
  const { map } = useGlMap();
  const kind = useReplayCamera((s) => s.kind);
  useEffect(() => {
    if (!kind) return;
    const wasFollow = useOwnShip.getState().follow;
    useOwnShip.getState().setFollow(false);
    const maxZoom = map.getMaxZoom();
    map.setMaxZoom(CAMERA_MAX_ZOOM);
    const el = map.getContainer();
    el.dataset.replayCamera = kind;
    let frame = 0,
      shownAt: number | null = null;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const { at, points } = usePastFlight.getState();
      // The orbit goes round by itself; the rest move only with the replay.
      if (at === null || (at === shownAt && kind !== "orbit")) return;
      const here = positionAt(points, at);
      if (!here) return;
      shownAt = at;
      const pose = poseOf(
        kind,
        { lat: here.lat, lon: here.lon, altFt: here.alt_ft ?? null, trackDeg: here.track_deg ?? null },
        (lat, lon) => map.queryTerrainElevation([lon, lat]) ?? 0,
        { clockS: now / 1000, tower: useReplayCamera.getState().tower ?? points[0] ?? null },
      );
      if (pose.kind === "over") map.jumpTo({ center: [pose.lon, pose.lat], bearing: pose.bearing, pitch: 0 });
      else map.jumpTo(map.calculateCameraOptionsFromCameraLngLatAltRotation([pose.lon, pose.lat], pose.altM, pose.bearing, pose.pitch));
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      delete el.dataset.replayCamera;
      if (!map.style) return;
      map.setMaxZoom(maxZoom);
      useOwnShip.getState().setFollow(wasFollow);
    };
  }, [map, kind]);
  return null;
}
