import { feet, hm, nm, threeFigures } from "../../lib/format";
import type { Leg } from "../../lib/api/types";

/** A checkpoint card's leg lines (RouteMap's CheckpointCard): the heading,
 *  altitude and speed on from it, the leg to it, and when it comes. */
export function legFactRows(leg: { into?: Leg; out?: Leg; afterMin: number }): [string, string][] {
  const rows: [string, string][] = [];
  const { out, into } = leg;
  if (out) {
    const heading = out.magnetic_heading_deg != null ? `${threeFigures(out.magnetic_heading_deg)}° · ` : "";
    const speed = out.groundspeed_kt != null ? ` · ${Math.round(out.groundspeed_kt)} kt` : "";
    rows.push(["On from it", `${heading}${feet(out.altitude_ft)}${speed}`]);
  }
  if (into) rows.push(["Leg to it", [nm(into.distance_nm), into.ete_min != null && hm(into.ete_min)].filter(Boolean).join(" · ")]);
  rows.push(["Reached", `${hm(leg.afterMin)} after takeoff`]);
  return rows;
}
