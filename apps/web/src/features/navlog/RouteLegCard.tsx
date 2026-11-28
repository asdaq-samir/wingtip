import { Trash2 } from "lucide-react";
import CloseButton from "../../components/CloseButton";
import { CardAction, CardActionRow } from "../../components/CardAction";
import DirectToIcon from "../../lib/glyphs/DirectToIcon";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { SheetCard } from "../../components/SheetCard";
import FigureWait from "../../components/FigureWait";
import { threeFigures } from "../../lib/format";
import { nm } from "../../lib/format";

/** A leg of the route the pilot tapped on the map, as its sheet shows it
 *  (usePlanWorkspace's openLeg): its ends, the engine's figures, whether
 *  it is the leg being flown, and what can be done to the point it goes to
 *  -- each only where the planner already does it. */
export interface RouteLegView {
  key: string;
  from: string;
  to: string;
  /** The leg's length, nm, and its magnetic course, degrees: the nav log's
   *  leg's own (the engine's navlog: the true course less the FAA's
   *  variation), null until the leg streams in. */
  distanceNm: number | null;
  courseMagDeg: number | null;
  /** The leg arriving at the row flying mode is flying to (useFlyingTo). */
  active: boolean;
  /** Direct to its end, as the route list's Direct (directToPoint), and
   *  whether the route is flown direct to it already; none for a
   *  checkpoint, which the route cannot be sent direct to. */
  direct: { on: boolean; go: () => void } | null;
  /** Its end taken out of the route (removeStop): a stop only. */
  remove: (() => void) | null;
}

/**
 * The Route Leg sheet, as ForeFlight opens one from a tap on its course
 * (the owner's screenshot, 2026-11-08): the leg's ends, Active Leg on
 * the one being flown, its actions in a row -- Direct to its end in the
 * tint, Remove in iOS's red -- then its Distance and its Course, magnetic.
 * A card in the map's panel over the search on every screen, its title on
 * top and Close, which goes back to what was there (the one card rule,
 * the owner 2026-11-10: a route leg is a thing, one card over the search;
 * on a desktop it was a popover beside the panel).
 */
export default function RouteLegCard({ open, onClose }: { open: RouteLegView | null; onClose: () => void }) {
  if (!open) return null;
  return (
    // The leg's ends, and Active while it is the one flown, the head's line
    // under its name, as every card's head says what the card is (the one
    // drawer contract, 2026-11-17): they were a grey row and a pill of
    // their own under the head.
    <SheetCard
      title="Route Leg"
      description={`${open.from} → ${open.to}${open.active ? " · Active leg" : ""}`}
      onClose={onClose}
      testId="route-leg-card"
      action={<CloseButton onClick={onClose} data-testid="route-leg-close" />}
    >
      <RouteLegBody leg={open} />
    </SheetCard>
  );
}

function RouteLegBody({ leg }: { leg: RouteLegView }) {
  const actions = [leg.direct, leg.remove].filter(Boolean).length;
  return (
    <div className="flex flex-col gap-3">
      {actions > 0 && (
        <CardActionRow columns={actions === 2 ? 2 : 1}>
          {leg.direct && (
            <CardAction
              icon={<DirectToIcon />}
              label={leg.direct.on ? "Cancel Direct" : `Direct ${leg.to}`}
              pressed={leg.direct.on}
              onClick={leg.direct.go}
              testId="route-leg-direct"
            />
          )}
          {leg.remove && (
            <CardAction icon={<Trash2 />} label={`Remove ${leg.to}`} destructive onClick={leg.remove} testId="route-leg-remove" />
          )}
        </CardActionRow>
      )}
      <ListGroup>
        <ListRow title="Distance" value={leg.distanceNm === null ? <FigureWait /> : nm(leg.distanceNm)} data-testid="route-leg-distance" />
        <ListRow
          title="Course"
          value={leg.courseMagDeg === null ? <FigureWait /> : `${threeFigures(leg.courseMagDeg)}°M`}
          data-testid="route-leg-course"
        />
      </ListGroup>
    </div>
  );
}
