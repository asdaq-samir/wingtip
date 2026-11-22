import type { Map as MlMap } from "maplibre-gl";
import { positionAt, usePastFlight } from "../../../lib/replay/clock";
import { poseOf, type Pose } from "./cameraPose";
import { useReplayCamera, type View } from "../../../lib/replay/camera/cameraStore";

/** A camera's pose as the map's view: an eye in space through MapLibre's
 *  own conversion, straight down at the map's zoom now. */
function viewOf(map: MlMap, pose: Pose): View {
  if (pose.kind === "over") return { lon: pose.lon, lat: pose.lat, zoom: map.getZoom(), bearing: pose.bearing, pitch: 0 };
  const o = map.calculateCameraOptionsFromCameraLngLatAltRotation([pose.lon, pose.lat], pose.altM, pose.bearing, pose.pitch);
  const c = o.center as { lng: number; lat: number } | [number, number];
  const [lon, lat] = Array.isArray(c) ? c : [c.lng, c.lat];
  return { lon, lat, zoom: o.zoom ?? map.getZoom(), bearing: o.bearing ?? pose.bearing, pitch: o.pitch ?? pose.pitch };
}

/**
 * The replay's camera at moment `at` (s since 1970), for the screen's
 * camera (ReplayCameraGl, each frame): the menu's camera's view, null
 * with none picked or in a gap. `clockS` turns the orbit.
 */
export function replayView(map: MlMap, at: number, clockS: number): View | null {
  const { points } = usePastFlight.getState();
  const { kind, tower } = useReplayCamera.getState();
  if (!kind) return null;
  const here = positionAt(points, at);
  if (!here) return null;
  const followed = { lat: here.lat, lon: here.lon, altFt: here.alt_ft ?? null, trackDeg: here.track_deg ?? null };
  const ground = (lat: number, lon: number) => map.queryTerrainElevation([lon, lat]) ?? 0;
  return viewOf(map, poseOf(kind, followed, ground, { clockS, tower: tower ?? points[0] ?? null }));
}

/** The map put at a view at once. */
export function showView(map: MlMap, v: View) {
  map.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom, bearing: v.bearing, pitch: v.pitch });
}
