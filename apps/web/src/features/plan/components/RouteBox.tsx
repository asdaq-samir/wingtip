import { Suspense, useState } from "react";
import { Autocomplete, Token, TokenField, TokenInput } from "react-aria-components";
import { TriangleAlert } from "lucide-react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import ClearButton from "../../../components/ClearButton";
import { PANEL_FIELD } from "../../../components/panelField";
import { Button } from "../../../components/ui/button";
import { Alert, AlertAction, AlertDescription } from "../../../components/ui/alert";
import { InputGroup } from "../../../components/ui/input-group";
import { Popover, PopoverContent } from "../../../components/ui/popover";
import type { FuelStopSuggestion } from "../../../lib/api/types";
import { useKeyboardInset } from "../../../hooks/use-viewport";
import { fromChunk } from "../../../lib/fromChunk";
import { TEXT } from "../../../lib/text";
import PointAltitudeDialog, { type EditedPoint } from "./PointAltitudeDialog";
import type { RouteProcedure } from "./routeBox/RouteChips";
import type { RouteBoxProps } from "./routeBox/routeBoxProps";
import RouteToken from "./routeBox/RouteToken";
import type { RouteValue } from "./routeBox/routeTokens";
import { useRouteBox } from "../hooks/useRouteBox";

export type { RouteParts } from "./routeBox/routeEdit";
export type { RouteProcedure } from "./routeBox/RouteChips";

// The suggestions' list on a chunk of its own: React Aria's ListBox, which
// the route panel's chunk brings once the page has painted, kept out of
// the box's, which comes beside the first script (routeBoxChunk). Asked
// for as the box is first taken, before anything is typed.
const { Part: RouteSuggestions, prefetch: prefetchSuggestions } = fromChunk(
  () => import("./routeBox/RouteSuggestions"),
  (m) => m.default,
);

/** How far past the box's width its pills must reach before it counts as
 *  running on, px: past a hit area's reach, short of a pill. */
const RUNS_ON_PX = 8;

/**
 * The route as ForeFlight's is: one box, every point of it a pill in the
 * order flown -- the departure, the airports landed at and the waypoints
 * flown through, the destination -- an arrow between each two. The box is
 * React Aria's TokenField, each point a token: the caret goes anywhere
 * among them and what is typed there goes in there; typed after the
 * destination it goes on to it, the old destination a stop on the way
 * (or, with none, names it); Backspace takes the point before the caret
 * and Undo puts it back. A tap on an arrow asks for a stop there. The
 * airports and waypoints that answer what is typed are offered under the
 * box as it is typed (React Aria's Autocomplete; Enter takes the first,
 * or what was typed, "VPBNG 06C"). A pill is tapped to change it, and
 * moved or taken out from its menu -- a hold, a right-click, or Enter on
 * it selected -- any of them, the departure and the destination too: the
 * next airport along becomes the end taken out, and a route of two keeps
 * the other end, half a route. From Fly via, on the flight the Class B
 * stops (`via`), the ways round are offered before anything is typed.
 * Every change re-plans at once, so there is no Load button.
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
  directTo = null,
  onDirectTo,
  fuelStops = NO_FUEL_STOPS,
  onKeepFuelStops,
  onHideFuelStop,
  footer,
  addAt = null,
  onDone,
  unknownPoint = null,
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
    remove,
    value,
    onValue,
    onSubmit,
    onKeyDown,
    onFocus,
    onFieldClick,
    onPress,
    onBlur,
    focused,
    typed,
    clearTyped,
    field,
    slide,
    slideRow,
    toEnd,
    isRoom,
    arrowAt,
    done,
    suggestions,
    dismiss,
  } = useRouteBox({ dep, stops, dest, waypoints, onChange, onTypedProcedures, adding, onAddingChange, via, addAt, onDone });
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
  // Empty, the route, from its departure; then each end it lacks, said in
  // its token where its field was. After a whole route's destination no
  // words, at the pilot's ask ("Add stop" said it): what is typed there is
  // the new destination, the old one a stop on the way, as Maps' Add Stop
  // does, and a reader is told so (its label).
  const placeholder = !points.length ? "Route" : at === null ? (hasDest ? "" : "Destination") : at === 0 && !hasDep ? "Departure" : "";
  const label = !points.length
    ? "The route, from its departure"
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
    hasDest,
    full,
    roleOf,
    focused,
    typedAtEnd: !!typed.text && at === null,
    typedAtStart: !!typed.text && at === 0,
    procedures,
    onProcedures,
    fuelStops,
    onKeepFuelStops,
    onHideFuelStop,
    airspaceOf,
    metarColourOf,
    altitudeAt,
    unknown: unknownPoint?.ident ?? null,
    onOpenAirport,
    directTo,
    onDirectTo,
    change: (list: string[]) => void change(list),
    remove,
    editAltitude: (ident: string) => setEditing({ ident, waypoint: waypoints.has(ident), altitude: altitudeAt(ident, waypoints.has(ident)) }),
    arrowAt,
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
            // Four over its lines, and four under a line with no buttons
            // under it: the clear's 44-point area, round its 20 in a line
            // now 28 tall, reached past the box's top and foot (the iOS
            // audit's P1 on an approach's page).
            className={cn(
              "h-auto flex-wrap items-start rounded-(--radius-banner) border-0 pt-1 pb-0 pr-1.5 pl-1 shadow-none",
              !footer && "pb-1",
              PANEL_FIELD,
            )}
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
                style={{ overflowY: "hidden" }}
                className={cn(
                  "overscroll-x-contain",
                  "data-overflow-x-end:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]",
                  "data-overflow-x-start:[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]",
                  "data-overflow-x-start:data-overflow-x-end:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]",
                )}
                data-testid="route-slide"
              >
                <ScrollArea.Content ref={slideRow} className="flex flex-nowrap items-center py-1 pr-2">
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
                    {/* The field, one line that runs on sideways (the row slides): 16 at the least below md, as every
                        field is -- under 16 iOS zooms the page in on it (checkpoints.spec checks every field); 17 to a
                        finger, a row's, and 14 from md up. Idents in capitals, as they go in. */}
                    <TokenInput
                      ref={field}
                      onPointerDown={onPress}
                      onClick={onFieldClick}
                      data-testid="route-type"
                      data-placeholder={placeholder}
                      data-typed={typed.text}
                      className="min-h-7 w-max min-w-full whitespace-pre! font-mono text-base leading-7 uppercase outline-none md:text-sm pointer-coarse:text-(length:--type-row)"
                    >
                      {(segment) => (
                        <Token className="inline-block align-middle">
                          <RouteToken i={segment.value ?? 0} box={tokenBox} />
                        </Token>
                      )}
                    </TokenInput>
                    {placeholder === "Route" && !typed.text && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-base text-muted-foreground md:text-sm pointer-coarse:text-(length:--type-row)"
                      >
                        Route
                      </span>
                    )}
                  </TokenField>
                </ScrollArea.Content>
              </ScrollArea.Viewport>
            </ScrollArea.Root>
            {/* What is typed cleared, the field kept, as iOS's fields clear. */}
            {typed.text && <ClearButton label="Clear what is typed" onClear={clearTyped} className="mt-1 mr-1" />}
            {/* The route is cleared from its ••• menu, not a ✕ here (the
                owner, 2026-11-11, ShareMenu's Clear route). Folded again, as
                iOS's Done ends an edit: the box's first line at its end.
                Pressed, the field keeps the focus till it goes. */}
            {onDone && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={done}
                data-testid="route-box-done"
                className={cn(
                  "relative mt-1 ml-1 h-7 shrink-0 rounded-full px-1.5 font-semibold text-tint outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
                  TEXT.row,
                )}
              >
                Done
              </button>
            )}
            {/* Its own taps, not the box's room (isRoom), which types at the
                route's end; ten under the lines, the clear's 44-point area
                and the last button's apart (the iOS audit's P1). */}
            {footer && (
              <div className="flex w-full basis-full items-center pt-2.5 pr-0.5 pb-2 pl-1.5" data-testid="route-box-footer">
                {footer}
              </div>
            )}
          </InputGroup>
          {/* The suggestions under the box: the typing stays in the box,
            where the picker's sheet from the top would take the focus to a
            field of its own. As tall as there is room. */}
          <PopoverContent
            align="start"
            sideOffset={6}
            anchor={boxEl}
            className="w-(--anchor-width) max-w-[calc(100vw-16px)] gap-0 p-2"
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
        {unknownPoint && (
          // Under the box, the stock Alert in the destructive red its pill
          // is drawn in, with the one thing to do that the pill's tap does
          // not: Remove, the stock Button.
          <Alert variant="destructive" className="mt-1.5 border-0 bg-transparent px-2 py-0" data-testid="route-unknown">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription className={cn("text-destructive", TEXT.detail)}>
              {unknownPoint.ident
                ? `${unknownPoint.ident} isn't an airport or waypoint we know. Tap it to change it.`
                : "A point of the route isn't an airport or waypoint we know."}
            </AlertDescription>
            {unknownPoint.ident && points.includes(unknownPoint.ident) && (
              <AlertAction className="top-1/2 right-0 -translate-y-1/2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(points.indexOf(unknownPoint.ident!))}
                  data-testid="route-unknown-remove"
                  className="relative after:absolute after:-inset-y-1.5 after:inset-x-0"
                >
                  Remove
                </Button>
              </AlertAction>
            )}
          </Alert>
        )}
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
