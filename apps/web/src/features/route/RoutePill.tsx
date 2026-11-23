import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { isPosition, pointName } from "../../lib/identSchema";
import type { AirspaceClass } from "../../lib/preferences";
import { useAirspace } from "../../lib/useAirspace";
import { airportMarkSvg } from "../../lib/map/marks/airportMark";
import { colourOf } from "../../lib/map/marks/flightCategory";
import { feet, flightLevel } from "../../lib/format";
import { airportQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";
import { CHART } from "../../lib/tokens";
import { PointMenuItems } from "./PointControls";
import { DROPDOWN, useAfterMenu } from "./pointMenu";
import type { PointAltitude } from "./PointAltitudeDialog";

/** What a pill's menu does at its point (RouteToken gives each). */
export interface PillActions {
  /** Another point in its place, by the one search. */
  onChange?: () => void;
  /** The one search asked for a point before it, or after it. */
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onShowOnMap?: () => void;
  /** Its Procedures, of a kind: the field's departures where the route
   *  leaves it, else its approaches (or arrivals where it has none). */
  onProcedures?: (kind: "approach" | "arrival" | "departure") => void;
  /** Its card: an airport's, never a waypoint's. */
  onInfo?: () => void;
  direct: boolean;
  onDirect?: () => void;
  onAltitude: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
}

/**
 * One point of the route, as ForeFlight's route editor draws it (the
 * owner's screenshot, 2026-11-23): its ident in its airspace's look, a
 * tap on it its menu -- the stock DropdownMenu, the same items as FPL's
 * timeline's "⋯" (PointMenuItems): Info, Insert Before and After, Show on
 * Map, Procedures, Change, Direct To, the altitude, Move, Remove (whose
 * Undo is the plan's toast). What is wrong there is on the pill itself: a
 * point not known or a field NASR lists closed in red, with "Closed" in
 * its name (decision 0043), and a caution a "!" at its top right, each
 * said in words at its menu's head.
 */
export default function RoutePill({
  ident,
  waypoint,
  index,
  role,
  stopNumber,
  airspaceOf,
  metarColourOf,
  altitude,
  unknown = null,
  cautions = NO_CAUTIONS,
  actions,
}: {
  ident: string;
  waypoint: boolean;
  index: number;
  role: "dep" | "stop" | "dest";
  stopNumber: number;
  /** Not a place the planner knows, and why: in red, invalid to a reader. */
  unknown?: string | null;
  /** The plan's cautions at it: the altitude's, a flight short of fuel. */
  cautions?: string[];
  airspaceOf: (ident: string) => AirspaceClass | undefined;
  metarColourOf: (ident: string) => string | undefined;
  altitude: PointAltitude;
  actions: PillActions;
}) {
  const { later, finalFocus } = useAfterMenu();
  const field = !waypoint && !isPosition(ident) && !unknown;
  // Its card, shared with the timeline's (RouteTimeline asks the same):
  // whether NASR lists it closed, the engine's field_status as the planner
  // labels it (decision 0043; never a status code compared here), and which
  // of the FAA's charts it has, for Procedures.
  const card = useQuery({ ...airportQuery(ident), enabled: field, staleTime: 10 * 60_000 }).data;
  const closed = field ? (card?.closed ?? null) : null;
  // An airport as the sectional draws its airspace (lib/useAirspace), its
  // METAR's flight category in the middle; a waypoint the sectional's
  // magenta diamond; a present position, none.
  const known = airspaceOf(ident);
  const space = useAirspace({ ident, name: ident, airspace: known }, field && !known);
  const spaceClass = known ?? (space.name.startsWith("Class ") ? (space.name.slice(6) as AirspaceClass) : null);
  const mark = isPosition(ident) ? null : waypoint ? (
    <span aria-hidden="true" className="ml-0.5 size-2 shrink-0 rotate-45 rounded-[1px]" style={{ backgroundColor: CHART.waypoint }} />
  ) : (
    // 14 at a 16 px root, in rem, so it keeps its share of a larger text.
    <span
      aria-hidden="true"
      className="block size-3.5 shrink-0"
      dangerouslySetInnerHTML={{
        __html: airportMarkSvg(spaceClass, metarColourOf(ident) ?? colourOf(null), null, "block size-full overflow-visible"),
      }}
    />
  );
  // Procedures where the FAA publishes one of the kind the route flies
  // there (the d-TPP's codes: DP a departure, IAP an approach, STR an
  // arrival): a departure where the route leaves it, else an approach, or
  // an arrival at a field with no approach.
  const charts = new Set((card?.procedures ?? []).map((c) => c.kind));
  const kind =
    role === "dep" ? (charts.has("DP") ? "departure" : null) : charts.has("IAP") ? "approach" : charts.has("STR") ? "arrival" : null;
  const red = !!unknown || !!closed;
  const notes = [
    ...(unknown ? [{ text: unknown, tone: "error" as const }] : []),
    ...(closed ? [{ text: `${closed}. Pick another field.`, tone: "error" as const }] : []),
    ...cautions.map((text) => ({ text, tone: "caution" as const })),
  ];
  // The fields' own names, as the two fields were: "Departure", "Stop 1",
  // then what is wrong, so a reader hears it with the point.
  const label = role === "dep" ? "Departure" : role === "dest" ? "Destination" : `Stop ${stopNumber}`;
  const status = unknown ? ", not known" : closed ? ", Closed" : cautions.length ? ", with a caution" : "";
  const { onProcedures, onInsertBefore, onInsertAfter, onInfo, ...rest } = actions;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${label} ${pointName(ident)}${status}`}
            aria-invalid={red || undefined}
            aria-keyshortcuts="Delete"
            data-point={index}
            data-testid={role === "stop" ? "stop" : `route-${role}`}
            data-closed={closed ? "" : undefined}
            // A swipe that starts on it slides the row (swipe-ignore "x"),
            // up or down the sheet's; no iOS callout over a hold.
            data-base-ui-swipe-ignore="x"
            // 28 tall, as the chips are, as wide as its ident; a finger's 44
            // round it, half the gap-2 wider each side so neighbours' areas
            // meet (hit-x-1), laid against the pill (relative).
            className={cn(
              "relative h-7 gap-1 rounded-full px-0.75 font-semibold uppercase hit-x-1 hit-y-2 touch-manipulation select-none [-webkit-touch-callout:none]",
              TEXT.detail,
              isPosition(ident) && "normal-case",
              red ? "bg-destructive/10 text-destructive hover:text-destructive" : "text-foreground",
            )}
          />
        }
      >
        {mark}
        {pointName(ident)}
        {/* ForeFlight's red "!" at its top right; the words in the menu. */}
        {!red && cautions.length > 0 && (
          <span
            aria-hidden="true"
            data-testid="pill-caution"
            className={cn(
              "absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive font-bold text-background",
              TEXT.caption,
            )}
          >
            !
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56" finalFocus={finalFocus}>
        <PointMenuItems
          kit={DROPDOWN}
          later={later}
          testId="pill-menu"
          actions={{
            ...rest,
            ident: pointName(ident),
            notes,
            onAddBefore: onInsertBefore,
            onAddAfter: onInsertAfter,
            onInfo: field ? onInfo : undefined,
            onProcedures: kind && onProcedures ? () => onProcedures(kind) : undefined,
            altitude: (
              <span className={cn("flex items-center gap-1", altitude.caution?.length && "text-caution-ink")}>
                {altitude.caution?.length ? <TriangleAlert className="size-3.5" aria-label="With a caution" /> : null}
                {waypoint ? flightLevel(altitude.feet) : altitude.feet === null ? "—" : feet(altitude.feet)}
              </span>
            ),
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NO_CAUTIONS: string[] = [];
