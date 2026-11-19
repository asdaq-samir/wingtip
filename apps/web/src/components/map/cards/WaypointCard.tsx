import { MapCard } from "../../../lib/map/cards/MapCard";
import { PointWhere } from "../../../lib/map/cards/PointWhere";
import { PointActions } from "./PointCardActions";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { fixRadialDistance } from "../../../lib/navaid";
import { TEXT } from "../../../lib/text";
import { CardShareButton } from "../../CardHead";
import { markLink } from "../../../lib/address";
import { shareOrCopy } from "../../../lib/share";
import { useRingWhileUp } from "../../../lib/map/mapPick";

/**
 * The card a tap on a VFR waypoint opens (the map draws them from the
 * overlay tiles: components/map/layers/NavaidsGl's WaypointsGl), or its
 * link (`mark`).
 */

export type Waypoint = { ident: string; lat: number; lon: number; description?: string | null };

/** A VFR waypoint's card, made once it is opened: its ident the name and
 *  what it is the line under it ("VPXYZ" / "VFR Waypoint", the owner,
 *  2026-11-18: the title is the thing's ident, the line its kind), where it
 *  is off the nearest VOR on the map as a controller places it, and Direct
 *  To, Add to Route and Copy of its ident, as a VOR's card (PointActions),
 *  at the owner's ask for cards that say what a pilot does there
 *  (2026-10-30). */
export function WaypointCard({ waypoint: w }: { waypoint: Waypoint }) {
  const stations = usePointActions((s) => s.stations);
  const frd = fixRadialDistance(w, stations);
  useRingWhileUp(w);
  const share = () =>
    void shareOrCopy({ title: w.ident, url: markLink({ kind: "vfr", ident: w.ident, lat: w.lat, lon: w.lon }, location.origin) }).catch(
      () => {
        /* put away, or not allowed: nothing to say */
      },
    );
  return (
    <MapCard
      start={<CardShareButton onShare={share} />}
      title={w.ident}
      subtitle={["VFR Waypoint", w.description].filter(Boolean).join(" · ")}
    >
      <PointActions point={w} copy={{ label: "Copy", text: w.ident }} addTestId="waypoint-add-stop" />
      {frd && (
        <p className={TEXT.row} data-testid="waypoint-frd">
          {frd}
        </p>
      )}
      <PointWhere lat={w.lat} lon={w.lon} />
    </MapCard>
  );
}
