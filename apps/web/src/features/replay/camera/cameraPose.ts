import { M_PER_FT } from "../../../lib/geo";
import { MAP } from "../../../lib/tokens";
import type { CameraKind } from "./cameraStore";

/** Metres in a degree of latitude, near enough for a camera's few hundred
 *  metres (the WGS-84 meridian degree is 110.6 to 111.7 km). */
const M_PER_DEG = 111_320;

/** The look down from the pilot's seat, degrees from straight down: the
 *  pilot's view's own (PilotCamera's PILOT_PITCH). */
const COCKPIT_PITCH = 72;
/** The chase camera: this far behind the airplane and this far above,
 *  m, which looks down on it at about 72 degrees from straight down, the
 *  ground round it in sight. */
const CHASE_BACK_M = 600;
const CHASE_UP_M = 200;
/** The orbit: its radius and height over the airplane, m, and how fast
 *  it goes round, degrees a second of the screen's time. */
const ORBIT_M = 1200;
const ORBIT_UP_M = 500;
const ORBIT_DEG_S = 6;
/** The tower's eye over the ground it stands on, m: a control tower's cab. */
const TOWER_UP_M = 30;
/** The least a camera stands over the ground, m: on the runway a little
 *  over it, never under (PilotCamera's). */
const OVER_GROUND_M = 15;
/** As far as the 3D map tilts (tokens' MAP.pitchMax): a camera asked to look
 *  flatter than this looks this far. */
const MOST_PITCH = MAP.pitchMax;

/** The airplane as a camera follows it. Its altitude is the track's
 *  (pressure altitude for adsb.lol's): the picture is a view, not a
 *  measurement, and is drawn over the ground never under it. */
export interface Followed {
  lat: number;
  lon: number;
  altFt: number | null;
  trackDeg: number | null;
}

/** A camera at a point in space looking along a bearing and down at a
 *  pitch (MapLibre's calculateCameraOptionsFromCameraLngLatAltRotation),
 *  or the map centred straight down on a point. */
export type Pose =
  | { kind: "eye"; lat: number; lon: number; altM: number; bearing: number; pitch: number }
  | { kind: "over"; lat: number; lon: number; bearing: number };

/** `m` metres from a point on `bearing`, on a local flat earth. */
export function offset(lat: number, lon: number, bearing: number, m: number): { lat: number; lon: number } {
  const b = (bearing * Math.PI) / 180;
  return { lat: lat + (m * Math.cos(b)) / M_PER_DEG, lon: lon + (m * Math.sin(b)) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)) };
}

/** The bearing and the pitch (from straight down) to look from one point
 *  at another, the pitch held to what the map tilts to. */
export function lookAt(
  from: { lat: number; lon: number; altM: number },
  to: { lat: number; lon: number; altM: number },
): { bearing: number; pitch: number } {
  const north = (to.lat - from.lat) * M_PER_DEG;
  const east = (to.lon - from.lon) * M_PER_DEG * Math.cos((from.lat * Math.PI) / 180);
  const across = Math.hypot(north, east);
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  const pitch = (Math.atan2(across, from.altM - to.altM) * 180) / Math.PI;
  return { bearing, pitch: Math.min(MOST_PITCH, Math.max(0, pitch)) };
}

/**
 * Where each camera stands and looks for the airplane `at`:
 *
 * - chase: behind it along its track and above, looking at it;
 * - cockpit: in its seat, looking down its track (the pilot's view's);
 * - orbit: round it, `clockS` turning the circle;
 * - tower: at `tower` (the flight's first report where none is set),
 *   TOWER_UP_M over the ground, turning to follow it;
 * - top: straight down on it, north up.
 *
 * `groundM` is the ground's height under a point, m (the 3D map's own,
 * queryTerrainElevation, at true height while a camera follows:
 * heightStretch's drawnStretch); every eye is kept OVER_GROUND_M over it.
 */
export function poseOf(
  kind: CameraKind,
  at: Followed,
  groundM: (lat: number, lon: number) => number,
  opts: { clockS: number; tower: { lat: number; lon: number } | null },
): Pose {
  const track = at.trackDeg ?? 0;
  const ground = groundM(at.lat, at.lon);
  const plane = { lat: at.lat, lon: at.lon, altM: Math.max((at.altFt ?? 0) * M_PER_FT, ground + OVER_GROUND_M) };
  const eyeAt = (p: { lat: number; lon: number }, altM: number): Pose => {
    const altKept = Math.max(altM, groundM(p.lat, p.lon) + OVER_GROUND_M);
    const look = lookAt({ ...p, altM: altKept }, plane);
    return { kind: "eye", ...p, altM: altKept, ...look };
  };
  switch (kind) {
    case "cockpit":
      return { kind: "eye", ...plane, bearing: track, pitch: COCKPIT_PITCH };
    case "chase":
      return eyeAt(offset(at.lat, at.lon, track + 180, CHASE_BACK_M), plane.altM + CHASE_UP_M);
    case "orbit":
      return eyeAt(offset(at.lat, at.lon, (opts.clockS * ORBIT_DEG_S) % 360, ORBIT_M), plane.altM + ORBIT_UP_M);
    case "tower": {
      const stand = opts.tower ?? { lat: at.lat, lon: at.lon };
      return eyeAt(stand, groundM(stand.lat, stand.lon) + TOWER_UP_M);
    }
    case "top":
      return { kind: "over", lat: at.lat, lon: at.lon, bearing: 0 };
  }
}
