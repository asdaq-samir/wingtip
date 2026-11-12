import { M_PER_FT } from "./geometry";

/*
 * Where an airplane of the traffic stands in the 3D view (TrafficAloftGl):
 * at its reported height over where it is, a thin line down to the ground
 * under it. Pure, so it is tested without a map.
 *
 * The height: the planner gives each airplane's geometric height where it
 * sends one (adsb.lol's and ADS-B Exchange's `alt_geom`, the GNSS's height
 * above the WGS-84 ellipsoid), else its pressure altitude (`alt_baro`, the
 * Mode C's, referenced to 29.92 inHg, 14 CFR 91.217(a)(2)) set on the
 * nearest METAR's altimeter, which an altimeter there reads as height
 * above sea level, else left as sent and marked `pressure_altitude`
 * (wingtip.traffic.common, view.on_altimeter). The 3D ground is heights
 * above mean sea level (the planner's terrain tiles, wingtip.terrain_view),
 * so the map's heights want MSL. The ellipsoid's height is not quite that:
 * over the United States the geoid, mean sea level's surface, lies tens of
 * metres under the ellipsoid (NGS's geoid model, GEOID18), so a geometric
 * height reads that much under the airplane's height above sea level --
 * within about 100 ft, as wingtip.traffic.common has it -- and an uncorrected pressure
 * altitude is off by about 1,000 ft an inch of mercury the day is off
 * standard (FAA-H-8083-25C ch. 11, Figure 11-3). Both are drawn as sent --
 * a picture of where the traffic is, as the 2D map's labels are, not a
 * separation figure -- and never under the ground.
 */

/** An airplane's height to stand it at, metres MSL: its reported height,
 *  never under the ground under it (`groundM`); on the ground where it
 *  sends none. */
export function standAtM(altitudeFt: number | null | undefined, groundM: number): number {
  if (altitudeFt == null) return groundM;
  return Math.max(groundM, altitudeFt * M_PER_FT);
}

/** A point in the map's world to the screen, CSS pixels from the map's
 *  top left, through the frame's model view projection matrix (a custom
 *  layer's `modelViewProjectionMatrix`, column-major as WebGL's); null
 *  behind the camera. On MapLibre's flat (Mercator) map that matrix takes
 *  x and y in world pixels -- a MercatorCoordinate's 0 to 1 times the
 *  world's size at the zoom (`worldPx`) -- and z in metres above sea level,
 *  the 3D ground's own height under the camera taken off inside it
 *  (MercatorTransform's _viewProjMatrix). */
export function toScreen(
  m: ArrayLike<number>,
  p: { x: number; y: number; z: number },
  width: number,
  height: number,
): { x: number; y: number } | null {
  const cx = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!;
  const cy = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!;
  const cw = m[3]! * p.x + m[7]! * p.y + m[11]! * p.z + m[15]!;
  if (cw <= 0) return null;
  return { x: ((cx / cw + 1) / 2) * width, y: ((1 - cy / cw) / 2) * height };
}

/** A place and a height as the matrix takes them (toScreen). */
export const worldPoint = (mercator: { x: number; y: number }, worldPx: number, altM: number) => ({
  x: mercator.x * worldPx,
  y: mercator.y * worldPx,
  z: altM,
});

/** The world's size in pixels at a MapLibre zoom: its 512-pixel tile
 *  doubled each level. */
export const worldPxAt = (zoom: number) => 512 * 2 ** zoom;

/** Whether a point on the screen is in the map's frame, `margin` px round it. */
export const inFrame = (p: { x: number; y: number }, width: number, height: number, margin = 40) =>
  p.x >= -margin && p.y >= -margin && p.x <= width + margin && p.y <= height + margin;
