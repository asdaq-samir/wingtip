import { ArrowRight, Trash2 } from "lucide-react";
import { cn } from "cn";
import CloseButton from "../../../components/CloseButton";
import { CardAction } from "../../../components/CardAction";
import DirectToIcon from "../../../components/DirectToIcon";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent } from "../../../components/ResponsivePopover";
import { Badge } from "../../../components/ui/badge";
import { threeFigures } from "../../../lib/format";
import { TEXT } from "../../../lib/text";
import { nm } from "../../../lib/format";

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
 * A card in the map's panel on a phone, its title on top and Close, which
 * goes back to what was there, as FixCard is.
 */
export default function RouteLegCard({ open, onClose }: { open: RouteLegView | null; onClose: () => void }) {
  return (
    <ResponsivePopover open={!!open} onOpenChange={next => { if (!next) onClose(); }}>
      {/* Beside the top of the screen on a desktop. */}
      <ResponsivePopoverAnchor asChild><span aria-hidden="true" className="pointer-events-none fixed top-16 left-1/2 size-0" /></ResponsivePopoverAnchor>
      <ResponsivePopoverContent
        title="Route Leg" side="bottom" align="center"
        className="flex w-80 flex-col gap-3 p-3" data-testid="route-leg-card"
        action={<CloseButton onClick={onClose} data-testid="route-leg-close" />}
      >
        {open && <RouteLegBody leg={open} />}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

function RouteLegBody({ leg }: { leg: RouteLegView }) {
  const actions = [leg.direct, leg.remove].filter(Boolean).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className={cn("flex min-w-0 items-center gap-1.5 font-semibold text-muted-foreground", TEXT.row)} data-testid="route-leg-ends">
          <span className="truncate">{leg.from}</span>
          <ArrowRight className="size-4 shrink-0" aria-label="to" />
          <span className="truncate">{leg.to}</span>
        </p>
        {leg.active && <Badge variant="secondary" className="shrink-0" data-testid="route-leg-active">Active Leg</Badge>}
      </div>
      {actions > 0 && (
        <div className={cn("grid gap-2", actions === 2 ? "grid-cols-2" : "grid-cols-1")} data-testid="route-leg-actions">
          {leg.direct && (
            <CardAction
              icon={<DirectToIcon />} label={leg.direct.on ? "Cancel Direct" : `Direct ${leg.to}`} pressed={leg.direct.on}
              onClick={leg.direct.go} testId="route-leg-direct"
            />
          )}
          {leg.remove && (
            <CardAction icon={<Trash2 />} label={`Remove ${leg.to}`} destructive onClick={leg.remove} testId="route-leg-remove" />
          )}
        </div>
      )}
      <ListGroup>
        <ListRow title="Distance" value={leg.distanceNm === null ? "—" : nm(leg.distanceNm)} data-testid="route-leg-distance" />
        <ListRow
          title="Course" value={leg.courseMagDeg === null ? "—" : `${threeFigures(leg.courseMagDeg)}°M`}
          data-testid="route-leg-course"
        />
      </ListGroup>
    </div>
  );
}
