import { MapCard } from "./MapCard";
import { MAGENTA } from "../useAirspace";
import { PointWhere } from "./PointWhere";
import { PointActions } from "./PointCardActions";
import { usePointActions } from "./pointActions";
import { fixRadialDistance } from "../navaid";
import { TEXT } from "../text";

/**
 * The card a tap on a VFR waypoint opens (the map draws them from the
 * overlay tiles: lib/map/gl/layers/NavaidsGl's WaypointsGl).
 */

export type Waypoint = { ident: string; lat: number; lon: number; description?: string | null };

/** A VFR waypoint's card, made once it is opened: what it is and where,
 *  off the nearest VOR on the map as a controller places it, and Direct
 *  To, Add to Route and Copy of its ident, as a VOR's card (PointActions),
 *  at the owner's ask for cards that say what a pilot does there
 *  (2026-10-30). No name of its own: what it is beside its ident, and where
 *  it is on a line of its own (the planner's wingtip.places) -- on one line the
 *  card ran the screen's width. */
export function WaypointCard({ waypoint: w }: { waypoint: Waypoint }) {
  const stations = usePointActions(s => s.stations);
  const frd = fixRadialDistance(w, stations);
  return (
    <MapCard
      pill={{ name: `${w.ident} VFR waypoint`, line: w.description || frd || undefined, colour: MAGENTA }}
      // The map's magenta triangle, as it marks it, before its ident.
      media={(
        <svg className="mx-1 shrink-0" width="16" height="16" viewBox="0 0 10 10" aria-hidden="true">
          <polygon points="5,1 9.4,8.8 0.6,8.8" fill="#fff" stroke={MAGENTA} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
      title={<>{w.ident}<span className="font-normal text-muted-foreground">VFR waypoint</span></>}
      subtitle={w.description || undefined}
    >
      <PointActions point={w} copy={{ label: "Copy", text: w.ident }} addTestId="waypoint-add-stop" />
      {frd && <p className={TEXT.row} data-testid="waypoint-frd">{frd}</p>}
      <PointWhere lat={w.lat} lon={w.lon} />
    </MapCard>
  );
}

