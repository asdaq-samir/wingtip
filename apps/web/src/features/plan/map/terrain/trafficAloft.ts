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

/** The picture an airplane's mark wears (TrafficAloftGl's images): its
 *  colour's, an arrow where it reports a track, else a dot. */
export const trafficPicture = (near: boolean, hasTrack: boolean) => `traffic3d|${near ? "near" : "far"}|${hasTrack ? "arrow" : "dot"}`;
