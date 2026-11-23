import { Suspense, useState } from "react";
import { Autocomplete, Token, TokenField, TokenInput } from "react-aria-components";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import { PANEL_FIELD } from "../../components/panelField";
import { InputGroup } from "../../components/ui/input-group";
import { Popover, PopoverContent } from "../../components/ui/popover";
import { SearchFieldClear } from "../../components/ui/search-field";
import { unknownWhy } from "../../lib/api/client";
import type { FuelStopSuggestion } from "../../lib/api/types";
import { useKeyboardInset } from "../../hooks/use-viewport";
import { fromChunk } from "../../lib/fromChunk";
import { TEXT } from "../../lib/text";
import RouteBoxAlert from "./RouteBoxAlert";
import PointAltitudeDialog, { type EditedPoint } from "./PointAltitudeDialog";
import type { RouteProcedure } from "./RouteChips";
import type { RouteBoxProps } from "./routeBoxProps";
import RouteToken from "./RouteToken";
import type { RouteValue } from "./routeTokens";
import { useRouteBox } from "./useRouteBox";

export type { RouteParts } from "./routeEdit";
export type { RouteProcedure } from "./RouteChips";

// The suggestions' list on a chunk of its own: React Aria's ListBox, which
// the route panel's chunk brings once the page has painted, kept out of
// the box's, which comes beside the first script (routeBoxChunk). Asked
// for as the box is first taken, before anything is typed.
const { Part: RouteSuggestions, prefetch: prefetchSuggestions } = fromChunk(
  () => import("./RouteSuggestions"),
  (m) => m.default,
);

/** How far past the box's width its pills must reach before it counts as
 *  running on, px: past a hit area's reach, short of a pill. */
const RUNS_ON_PX = 8;

/**
 * The route as ForeFlight's is: one box, every point of it a pill in the
 * order flown, left to right with no arrows (the owner, 2026-11-23). The
 * box is React Aria's TokenField, each point a token: the caret goes
 * anywhere among them and what is typed there goes in there; typed after
 * the destination it goes on to it, the old one a stop on the way;
 * Backspace takes the point before the caret and Undo puts it back. What
 * answers the typing is offered under the box (React Aria's Autocomplete;
 * Enter takes the first, or what was typed, "VPBNG 06C"). A tap on a pill
 * is its menu (RoutePill: Info, Insert Before and After, Show on Map,
 * Procedures, Change, Move, Remove), as Enter on it is; the arrow keys go
 * between pills and Delete takes one out, the ends too: the next airport
 * along becomes the end, a route of two keeping the other, half a route.
 * From Fly via (`via`) the ways round the Class B are offered before
 * anything is typed. Every change re-plans at once: no Load button.
 *
 * The search bar's field, as Maps' is, round at a line's ends to sit in
 * the sheet's round corners. The ends stay airports: a waypoint is flown
 * through, never taken off from or landed at, so a change that would put
 * one at an end is undone (routeEdit).
 */
export default function RouteBox({
  dep,
  stops,
  dest,
  waypoints,
  airspaceOf,
  metarColourOf,
  altitudeAt,
  onAltitudeChange,
  onChange,
  onTypedProcedures,
  adding,
  onAddingChange,
  via,
  procedures = NO_PROCEDURES,
  onProcedures,
  onOpenAirport,
  onOpenProcedures,
  onShowOnMap,
  shortFlights = NO_SHORT,
  directTo = null,
  onDirectTo,
  fuelStops = NO_FUEL_STOPS,
  onKeepFuelStops,
  onHideFuelStop,
  addAt = null,
  unknownPoint = null,
  unreachable = false,
  onClear,
  wrapped = false,
  height,
  foot,
}: RouteBoxProps) {
  // Each by its own name: three of them are refs (the field, the row and
  // its content), which the compiler keeps apart from what is drawn.
  const {
    points,
    hasDep,
    hasDest,
    full,
    roleOf,
    change,
    canChange,
    remove,
    value,
    onValue,
    onSubmit,
    onKeyDown,
    onFocus,
    onFieldClick,
    onPress,
    onBlur,
    typed,
    clearTyped,
    field,
    slide,
    slideRow,
    toEnd,
    isRoom,
    insertAt,
    suggestions,
    dismiss,
  } = useRouteBox({ dep, stops, dest, waypoints, onChange, onTypedProcedures, adding, onAddingChange, via, addAt });
  // The point whose altitude is being set, from its menu.
  const [editing, setEditing] = useState<EditedPoint | null>(null);
  // The box, which the suggestions are placed under (their popover's
  // anchor) and a press in which is not one outside them.
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  // Room under the suggestions' last row for a phone's keyboard, as the
  // airport picker's sheet has, so they scroll up above it: the window's
  // reading, as the popover is on the body, out of the Drawer's viewport.
  const keyboard = useKeyboardInset();
  const at = typed.at;
  // Empty, the route, from its departure; a lacking departure said in its
  // token where its field was, no ghost word after the last point (the owner,
  // 2026-11-23). After a whole route's destination no words, at the pilot's ask ("Add stop" said it): what is typed there is
  // the new destination, the old one a stop on the way, as Maps' Add Stop
  // does, and a reader is told so (its label).
  const placeholder = !points.length ? "Route" : at === null ? "" : at === 0 && !hasDep ? "Departure" : "";
  const label = !points.length
    ? "The route: its departure and destination, or a whole route typed, as KPWK V100 KLAS"
    : at === null
      ? hasDest
        ? "Add stop, the new destination"
        : "The destination"
      : at === 0 && !hasDep
        ? "The departure"
        : "A stop here";
  const tokenBox = {
    points,
    waypoints,
    hasDep,
    full,
    roleOf,
    typedAtStart: !!typed.text && at === 0,
    procedures,
    onProcedures,
    onOpenProcedures,
    fuelStops,
    onKeepFuelStops,
    onHideFuelStop,
    shortFlights,
    airspaceOf,
    metarColourOf,
    altitudeAt,
    unknown: unknownPoint?.ident ?? null,
    unknownWhy: unknownPoint?.ident ? `${unknownPoint.ident} ${unknownWhy(unknownPoint)}.` : null,
    onOpenAirport,
    onShowOnMap,
    directTo,
    onDirectTo,
    change: (list: string[]) => void change(list),
    canChange,
    remove,
    editAltitude: (ident: string) =>
      setEditing({ ident, waypoint: waypoints.has(ident), altitude: altitudeAt(ident, waypoints.has(ident)) }),
    insertAt,
  };
  return (
    // React Aria's Autocomplete round the field and its suggestions: the
    // arrows light a row and Enter takes it, the typing staying in the box.
    <Autocomplete>
      <div className="min-w-0">
        <Popover
          open={suggestions.open}
          onOpenChange={(next, details) => {
            // A press in the box is not outside: it types there.
            if (!next && details.reason === "outside-press" && boxEl?.contains(details.event.target as Node)) {
              details.cancel();
              return;
            }
            if (!next) dismiss();
          }}
        >
          {/* The search bar's field, as Maps' is with no route: its grey, no line round it, its corners round, the
             pills on it in the sheet's own colour, one line tall. */}
          <InputGroup
            ref={setBoxEl}
            onMouseDown={(e) => {
              if (isRoom(e)) e.preventDefault();
            }}
            onClick={toEnd}
            // Four over its line and four under it: the clear's 44-point
            // area, round its 20 in a line 28 tall, reached past the box's
            // top and foot (the iOS audit's P1 on an approach's page). Its
            // buttons are the sheet's first row's strip over it (FplBar;
            // the owner, 2026-11-14), not a footer of its own.
            className={cn(
              "h-auto flex-wrap items-start border-0 pt-1 pb-1 shadow-none",
              // Turned from the grouped box: the timeline card's corners, its
              // words left-aligned at the box's own 16 of padding, and its
              // controls as far in from the right (TIMELINE_END), so nothing
              // moves as the face turns (the owner's iPhone, 2026-11-23).
              // Wrapped, a toggle's row of room under its last line (h-11): the
              // fuel stops' pill and the toggle sit there (RouteEditor), under the
              // pills, never over them (the owner's iPhone, 2026-11-23).
              wrapped ? "rounded-(--radius-card) pr-4 pb-11 pl-4" : "rounded-(--radius-banner) pr-1.5 pl-1",
              PANEL_FIELD,
            )}
            // Wrapped, the grouped box's height at the least, growing with the lines.
            style={wrapped && height ? { minHeight: height } : undefined}
            data-wrapped={wrapped || undefined}
            data-testid="route-box"
          >
            {/* The pills in one row that slides sideways under a finger when the route is longer than the box (the
               owner, 2026-11-04: "FPL can be fixed as one row, in which ids can slide"), as ForeFlight's flight plan
               box does; the end faded where it runs on (Base UI's ScrollArea says so on its viewport), so a point past
               it reads as there. A drag up or down on it is the sheet's (the Drawer's swipe), across is the row's. */}
            <ScrollArea.Root overflowEdgeThreshold={RUNS_ON_PX} className="min-w-0 flex-1 basis-24">
              <ScrollArea.Viewport
                ref={slide}
                // Out of the tab order; a drag up or down is the sheet's.
                tabIndex={-1}
                // Wrapped, every line in sight, the box grown to hold them: nothing
                // scrolls or is cut, a pill whole on its line.
                style={wrapped ? { overflow: "visible" } : { overflowY: "hidden" }}
                className={cn(
                  // Fades only on the one-row face: wrapped, one hid every line's right (2026-11-23).
                  wrapped
                    ? "overscroll-y-contain"
                    : [
                        "overscroll-x-contain",
                        "data-overflow-x-end:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]",
                        "data-overflow-x-start:[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]",
                        "data-overflow-x-start:data-overflow-x-end:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]",
                      ],
                )}
                data-testid="route-slide"
              >
                {/* Wrapped, no wider than the box: Base UI's least width, fit-content, ran past its edge. */}
                <ScrollArea.Content
                  ref={slideRow}
                  style={wrapped ? { minWidth: 0 } : undefined}
                  className={cn("flex items-center py-1 pr-2", wrapped ? "flex-wrap" : "flex-nowrap")}
                >
                  <TokenField<RouteValue>
                    aria-label={label}
                    value={value}
                    onChange={onValue}
                    onSubmit={onSubmit}
                    onKeyDown={onKeyDown}
                    onFocus={() => {
                      prefetchSuggestions();
                      onFocus();
                    }}
                    onBlur={onBlur}
                    className="relative min-w-full"
                  >
                    {/* The field, one line that runs on sideways (the row slides): 16 at the least below md -- under 16 iOS zooms in
                        (checkpoints.spec checks every field); 17 to a finger, 14 from md up. Capitals in the pills' semibold
                        sans on their 28 line, so what is typed sits level with them (the owner's iPhone, 2026-11-23). */}
                    <TokenInput
                      ref={field}
                      // The group's control, so the stock InputGroup draws its
                      // focus ring round the box while it is typed in, as the
                      // N-number's and the altitude's do (navlog/pillLook): the
                      // line's own outline is put away, and none showed.
                      data-slot="input-group-control"
                      onPointerDown={onPress}
                      onClick={onFieldClick}
                      data-testid="route-type"
                      data-typed={typed.text}
                      className={cn(
                        "min-h-7 min-w-full font-sans font-semibold uppercase outline-none",
                        wrapped ? "w-full whitespace-pre-wrap! break-words" : "w-max whitespace-pre!",
                        TEXT.row,
                        "leading-7 pointer-coarse:leading-7",
                      )}
                    >
                      {(segment) => (
                        // Inline, so its pieces wrap whole (RouteToken), not
                        // one block cut at the box's edge.
                        <Token className="inline">
                          <RouteToken i={segment.value ?? 0} box={tokenBox} />
                        </Token>
                      )}
                    </TokenInput>
                    {placeholder === "Route" && !typed.text && (
                      <span
                        aria-hidden="true"
                        className={cn("pointer-events-none absolute inset-y-0 left-1 flex items-center text-muted-foreground", TEXT.row)}
                      >
                        {/* What the empty box takes, in a few words, for a
                            pilot going step by step and one typing a filed
                            route alike (the FPL redesign, 2026-11-17). */}
                        From, to, or a whole route
                      </span>
                    )}
                  </TokenField>
                </ScrollArea.Content>
              </ScrollArea.Viewport>
            </ScrollArea.Root>
            {/* What is typed cleared, the field kept, as iOS's fields clear:
                React Aria's field clear (ui/search-field), its press keeping
                the focus in the box; the TokenField has no clear slot. */}
            {typed.text && <SearchFieldClear aria-label="Clear what is typed" onPress={clearTyped} className="mt-1 mr-1" />}
            {/* Nothing typed: half a route cleared by the same stock ✕; a
                route cleared is put back by the toast's Undo or Cmd-Z
                (the owner, 2026-11-23: "No undo needed next to toggle"). */}
            {!typed.text && onClear && points.length > 0 && (
              <SearchFieldClear aria-label="Clear the route" onPress={onClear} className="mt-1 mr-1" data-testid="route-box-clear" />
            )}
          </InputGroup>
          {/* The suggestions under the box: the typing stays in the box,
            where the picker's sheet from the top would take the focus to a
            field of its own. As tall as there is room. */}
          <PopoverContent
            align="start"
            sideOffset={6}
            anchor={boxEl}
            // At once, with no zoom: typing opens, closes and opens it
            // again as the box empties and fills, and a typed action is
            // not animated (the design review of 2026-11-23, N5).
            className="w-(--anchor-width) max-w-[calc(100vw-16px)] gap-0 p-2 data-closed:animate-none data-open:animate-none"
            style={keyboard > 0 ? { paddingBottom: keyboard } : undefined}
            // The typing stays in the box.
            initialFocus={false}
            data-testid="route-suggestions"
          >
            <Suspense fallback={null}>
              <RouteSuggestions
                rows={suggestions.rows}
                answered={suggestions.answered}
                via={suggestions.via}
                ownPoint={suggestions.ownPoint}
                onPick={suggestions.pick}
              />
            </Suspense>
          </PopoverContent>
        </Popover>
        {foot}
        <RouteBoxAlert unknownPoint={unknownPoint} unreachable={unreachable} points={points} remove={remove} />
        <PointAltitudeDialog
          point={editing}
          onClose={() => setEditing(null)}
          onSet={(ident, feet) => {
            onAltitudeChange(ident, feet);
            setEditing(null);
          }}
        />
      </div>
    </Autocomplete>
  );
}

const NO_PROCEDURES: RouteProcedure[] = [];
const NO_FUEL_STOPS: FuelStopSuggestion[] = [];
const NO_SHORT: NonNullable<RouteBoxProps["shortFlights"]> = [];
