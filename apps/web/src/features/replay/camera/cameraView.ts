import type { Map as MlMap } from "maplibre-gl";
import { usePreferences } from "../../../lib/preferences";
import { positionAt, usePastFlight } from "../../../lib/replay/clock";
import { poseOf, type Pose } from "./cameraPose";
import { useReplayCamera, type CameraKind } from "./cameraStore";
import { keyedView, type View } from "./keyframes";

/** A camera's pose as the map's view: an eye in space through MapLibre's
 *  own conversion, straight down at the map's zoom now. */
function viewOf(map: MlMap, pose: Pose): View {
  if (pose.kind === "over") return { lon: pose.lon, lat: pose.lat, zoom: map.getZoom(), bearing: pose.bearing, pitch: 0 };
  const o = map.calculateCameraOptionsFromCameraLngLatAltRotation([pose.lon, pose.lat], pose.altM, pose.bearing, pose.pitch);
  const c = o.center as { lng: number; lat: number } | [number, number];
  const [lon, lat] = Array.isArray(c) ? c : [c.lng, c.lat];
  return { lon, lat, zoom: o.zoom ?? map.getZoom(), bearing: o.bearing ?? pose.bearing, pitch: o.pitch ?? pose.pitch };
}

/** Where the map is looking now, for a keyframe set by hand. */
export function viewNow(map: MlMap): View {
  const c = map.getCenter();
  return { lon: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

/**
 * The replay's camera at moment `at` (s since 1970), the one answer the
 * screen's camera (ReplayCameraGl, each frame) and a video's (the export,
 * each frame it renders) both take: the keyframes' view where they are
 * followed, the menu's camera otherwise, null with neither or in a gap.
 * `clockS` turns the orbit: the screen's time, or the video's.
 */
export function replayView(map: MlMap, at: number, clockS: number): View | null {
  const { points } = usePastFlight.getState();
  const { kind, keys, keyed, tower } = useReplayCamera.getState();
  const here = positionAt(points, at);
  if (!here) return null;
  const followed = { lat: here.lat, lon: here.lon, altFt: here.alt_ft ?? null, trackDeg: here.track_deg ?? null };
  const ground = (lat: number, lon: number) => map.queryTerrainElevation([lon, lat]) ?? 0;
  const stretch = usePreferences.getState().heightStretch;
  const ofKind = (k: CameraKind) => viewOf(map, poseOf(k, followed, ground, { clockS, tower: tower ?? points[0] ?? null, stretch }));
  if (keyed && keys.length) return keyedView(keys, at, (key) => (key.kind === "fixed" ? key.fixed : ofKind(key.kind)));
  return kind ? ofKind(kind) : null;
}

/** The map put at a view at once. */
export function showView(map: MlMap, v: View) {
  map.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom, bearing: v.bearing, pitch: v.pitch });
}
