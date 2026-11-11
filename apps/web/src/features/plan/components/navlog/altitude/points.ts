import type { Leg } from "../../../../../lib/api/types";
import type { AlongPoint } from "./clearance";
import type { ProfilePoint } from "./LegAltitude";

/** Where the legs' points are along the side view: each leg's end at the
 *  miles flown to it, laid onto the side view's own length (its ground is
 *  sampled along the straight route; the legs bend round checkpoints). */
export function pointsAlong(legs: Leg[], lengthNm: number): AlongPoint[] {
  const total = legs.reduce((nm, l) => nm + l.distance_nm, 0);
  if (!legs.length || total <= 0) return [];
  const scale = lengthNm / total;
  let run = 0;
  const out: AlongPoint[] = [{ ident: legs[0]!.from, along_nm: 0 }];
  for (const leg of legs) {
    run += leg.distance_nm;
    out.push({ ident: leg.to, along_nm: run * scale });
  }
  return out;
}

/** The route's waypoints on the side view (`waypoints`, flown through,
 *  not landed at), each with the leg before the one into it, the one into
 *  it and the one out of it: what a tap on its mark sets. */
export function waypointsAlong(legs: Leg[], lengthNm: number, routePoints: string[], waypoints: Set<string>): ProfilePoint[] {
  const along = pointsAlong(legs, lengthNm);
  return routePoints.flatMap((ident) => {
    if (!waypoints.has(ident)) return [];
    const at = along.find((p) => p.ident === ident);
    if (!at || lengthNm <= 0) return [];
    const legIn = legs.find((l) => l.to === ident);
    return [
      {
        ident,
        along_nm: at.along_nm,
        share: at.along_nm / lengthNm,
        legBefore: legIn && legs.find((l) => l.to === legIn.from),
        legIn,
        legOut: legs.find((l) => l.from === ident),
      },
    ];
  });
}
