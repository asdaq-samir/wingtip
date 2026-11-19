import { MapCard } from "../../lib/map/cards/MapCard";
import { PointWhere } from "../../lib/map/cards/PointWhere";

/** What a point of the route is, under its name. */
export type RoutePointKind = "Route point" | "Top of climb" | "Top of descent";

/**
 * The card a tap on a point the route turns at, or a top of climb or of
 * descent, opens (RouteGl, LegPointsGl), as a VFR waypoint's or a fix's
 * does: its name ("WETEV", "TOC") and what it is under it, and where it is
 * from the airplane and on the chart. It opened none: the tap only ringed
 * the point and brought the map in, which with FPL's timeline up (the Nav
 * Log's row out of sight) looked like nothing (the selection audit,
 * 2026-11-18). Its ring is the Nav Log's point's, put away with the card.
 */
export default function RoutePointCard({ name, kind, lat, lon }: { name: string; kind: RoutePointKind; lat: number; lon: number }) {
  return (
    <MapCard title={name} subtitle={kind}>
      <PointWhere lat={lat} lon={lon} />
    </MapCard>
  );
}
