import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import AirportPicker from "../../../../components/AirportPicker";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "../../../../components/ui/context-menu";
import { isPosition, pointName } from "../../../../lib/identSchema";
import type { AirspaceClass } from "../../../../lib/preferences";
import { useAirspace } from "../../../../lib/useAirspace";
import { airportMarkSvg } from "../../../../lib/map/marks/airportMark";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { WAYPOINT_MAGENTA } from "../../../../lib/map/marks/chartColors";
import { altFt, flightLevel } from "../../../../lib/format";
import { TEXT } from "../../../../lib/text";
import { PointMenuItems } from "../PointControls";
import { CONTEXT_MENU, useAfterMenu } from "../pointMenu";
import type { PointAltitude } from "../PointAltitudeDialog";
import { holdGuard } from "./holdGuard";

/** One point of the route: its ident in its airspace's look, a tap to
 *  change it (the picker), and a drag to move it. Taken out from its own
 *  menu, as iOS takes things out -- a press and hold on a phone, a
 *  right-click with a mouse, Enter on its token selected in the box -- or
 *  Delete with it focused, or Backspace after it in the box: a cross on
 *  every pill was a row of targets crowded between them, at the pilot's
 *  ask. Any of them, the ends too (routeEdit's withoutPoint). */
export default function RoutePill({
  onStep,
  last,
  ident,
  waypoint,
  index,
  role,
  stopNumber,
  airspaceOf,
  metarColourOf,
  altitude,
  onChange,
  onEditAltitude,
  onRemove,
  onOpen,
  direct,
  onDirect,
  unknown = false,
}: {
  /** It, a place earlier (-1) or later (1): its menu's Move Up and Down. */
  onStep: (by: -1 | 1) => void;
  last: boolean;
  ident: string;
  waypoint: boolean;
  index: number;
  role: "dep" | "stop" | "dest";
  stopNumber: number;
  /** Not a place the planner knows: in red, and invalid to a reader. */
  unknown?: boolean;
  airspaceOf: (ident: string) => AirspaceClass | undefined;
  metarColourOf: (ident: string) => string | undefined;
  altitude: PointAltitude;
  onChange: (ident: string) => void;
  onEditAltitude: () => void;
  onRemove: () => void;
  /** A tap's, where it opens the airport's card (RouteBox's onOpenAirport). */
  onOpen?: () => void;
  direct: boolean;
  onDirect?: () => void;
}) {
  // The search, out from the menu's Change where a tap opens the card --
  // once the menu has closed, the focus left to the search, or it took the
  // focus from the search as it opened, which closed it (useAfterMenu).
  const [changing, setChanging] = useState(false);
  const { later, finalFocus } = useAfterMenu();
  // The finger that held it open lifted: not a tap on the pill (holdGuard).
  const [guard] = useState(holdGuard);
  // A finger's hold opens its menu by the stock ContextMenu's own long
  // press, as a right click does. Not dragged: its place changes by the
  // menu's Move Up and Down here, or by a drag in FPL's list (RouteGrid).
  // An airport as the sectional draws its airspace, as its Favorites tile
  // is (lib/useAirspace): Class B and C solid blue and magenta, D and E
  // dashed; G, and one not known yet, the sheet's own pill. A waypoint in
  // the sectional's magenta letters, where it carried a diamond that cost
  // a third pill its place on a phone's line.
  // Its METAR's flight category in the middle, as the chart's and
  // Nearest's marks have it (metarColourOf, PlanWorkspace's); grey without
  // one. It was a setting, airspace or weather, until the owner's split
  // (2026-10-27) found it did no more than this dot: the ring says the
  // airspace either way.
  // The class the course came with, else the airport's card asked for.
  const known = airspaceOf(ident);
  // Not for a present position, which has no card to ask for (it was
  // asked for, and the planner answered 404, at every Fly Here).
  const space = useAirspace({ ident, name: ident, airspace: known }, !waypoint && !known && !isPosition(ident));
  const spaceClass = known ?? (space.name.startsWith("Class ") ? (space.name.slice(6) as AirspaceClass) : null);
  // A word of the route's title (the owner's yes to the polish pass,
  // 2026-10-26: "the route box becomes a bold title"), led by the field's
  // own mark as the chart and Nearest draw it -- its airspace's ring, and
  // its METAR's colour in the middle where the setting asks for the
  // weather -- or a waypoint's magenta diamond. A present position, none.
  const mark = isPosition(ident) ? null : waypoint ? (
    <span aria-hidden="true" className="ml-0.5 size-2 shrink-0 rotate-45 rounded-[1px]" style={{ backgroundColor: WAYPOINT_MAGENTA }} />
  ) : (
    <span
      aria-hidden="true"
      className="block size-[14px] shrink-0"
      dangerouslySetInnerHTML={{
        __html: airportMarkSvg(spaceClass, metarColourOf(ident) ?? colourOf(null), null, "block size-full overflow-visible"),
      }}
    />
  );
  // The fields' own names, as the two fields were: "Departure", "Stop 1".
  const label = role === "dep" ? "Departure" : role === "dest" ? "Destination" : `Stop ${stopNumber}`;
  const pill = (
    // A group, not a button: the picker inside it is the button, and a
    // button in a button is nothing a reader can use (axe's
    // nested-interactive). Still focusable, for its Delete and its menu.
    <span
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a group round the pill's picker, focused for its Delete and its menu's key
      tabIndex={0}
      role="group"
      aria-label={`${label} ${ident}`}
      aria-keyshortcuts="Delete"
      data-point={index}
      data-base-ui-swipe-ignore="x"
      // Up or down scrolls the lines or moves the sheet (swipe-ignore "x", the one scrolling
      // rule); a hold, its menu. No iOS callout over the hold.
      className="inline-flex shrink-0 items-center rounded-full touch-pan-y select-none [-webkit-touch-callout:none]"
      data-testid={role === "stop" ? "stop" : `route-${role}`}
      onPointerDown={(e) => guard.down(e.pointerType === "touch")}
      onTouchEnd={(e) => {
        if (guard.lifted()) e.preventDefault();
      }}
    >
      {mark}
      <AirportPicker
        value={pointName(ident)}
        placeholder={label}
        ariaLabel={waypoint ? `${label}, a waypoint` : label}
        look="pill"
        fixes={role === "stop"}
        // 28 tall, as a fuel stop's and a procedure's chips are, at the
        // owner's ask ("make the other airport pills as thin as the fuel
        // airport pills"); a finger's 44 round it (index.css).
        // A line under a row's size, as the pills were: three fields and a
        // procedure's chip keep to one line on a phone (procedures.spec).
        // As wide as its ident, every gap the same: five letters wide, C81 sat
        // 14 points short of its arrow to KUGN's 6 (the owner, 2026-11-11:
        // "Look at the spacing of first airport in route").
        className={cn("h-7 rounded-full px-0.75", TEXT.detail, "font-semibold", unknown && "text-destructive")}
        onChange={onChange}
        invalid={unknown || undefined}
        open={changing}
        onOpenChange={setChanging}
        onTap={onOpen}
      />
    </span>
  );
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) guard.opened();
      }}
    >
      <ContextMenuTrigger render={pill} />
      {/* FPL's "⋯"'s items, in its words and order (PointMenuItems), at
          the audit's finding: the altitude there after Set altitude…, a
          waypoint's cruise as a flight level, an airport's pattern in feet,
          the plan's until the pilot sets their own. */}
      <ContextMenuContent finalFocus={finalFocus}>
        <PointMenuItems
          kit={CONTEXT_MENU}
          later={later}
          testId="pill-menu"
          actions={{
            ident: pointName(ident),
            onChange: onOpen ? () => setChanging(true) : undefined,
            direct,
            onDirect,
            onAltitude: onEditAltitude,
            onInfo: onOpen,
            onMoveUp: index > 0 ? () => onStep(-1) : undefined,
            onMoveDown: last ? undefined : () => onStep(1),
            onRemove,
            altitude: (
              <span className={cn("flex items-center gap-1", altitude.caution?.length && "text-caution-ink")}>
                {altitude.caution?.length ? <TriangleAlert className="size-3.5" aria-label="With a caution" /> : null}
                {waypoint ? flightLevel(altitude.feet) : altitude.feet === null ? "—" : `${altFt(altitude.feet)} ft`}
              </span>
            ),
          }}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
