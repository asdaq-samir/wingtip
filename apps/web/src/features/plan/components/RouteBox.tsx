import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Coffee, Fuel, PlaneLanding, PlaneTakeoff, Plus, Route, Trash2, TriangleAlert } from "lucide-react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import AirportPicker from "../../../components/AirportPicker";
import AirportResults, { AirportRow, PickerGroup } from "../../../components/AirportResults";
import ClearButton from "../../../components/ClearButton";
import { PANEL_FIELD } from "../../../components/panelField";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "../../../components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { Button } from "../../../components/ui/button";
import { Alert, AlertAction, AlertDescription } from "../../../components/ui/alert";
import { PointMenuItems } from "./PointControls";
import { CONTEXT_MENU, useAfterMenu } from "./pointMenu";
import { InputGroup } from "../../../components/ui/input-group";
import { CommandClear, CommandField, CommandRoot } from "../../../components/ui/command";
import { Popover, PopoverContent } from "../../../components/ui/popover";
import type { BaseUIEvent } from "@base-ui/react/types";
import type { Detour, FuelStopSuggestion } from "../../../lib/api/types";
import { MAX_STOPS, frdOf, identOf, isPosition, pointName, stopOf } from "../../../lib/identSchema";
import { prefersReducedMotion } from "../../../lib/motion";
import { usePreferences, type AirspaceClass, type RecentAirport } from "../../../lib/preferences";
import { useAirportSearch, type AirportSearchRow } from "../../../lib/useAirportSearch";
import { useKeyboardInset } from "../../../hooks/use-viewport";
import { useAirspace } from "../../../lib/useAirspace";
import { airportMarkSvg } from "../../../lib/map/marks/airportMark";
import { colourOf } from "../../../lib/map/marks/flightCategory";
import { WAYPOINT_MAGENTA } from "../../../lib/map/marks/chartColors";
import { altFt, bearing, flightLevel } from "../../../lib/format";
import { sameField, TYPED_PROCEDURE, type BranchFix, type TypedProcedure } from "../../../lib/procedures";
import { TEXT } from "../../../lib/text";
import PointAltitudeDialog, { type EditedPoint, type PointAltitude } from "./PointAltitudeDialog";
import { useStopAsked } from "../hooks/useStopAsked";

/** The route as the box changes it: either end may be missing (half a
 *  route, the other end still to be typed), and neither means none. */
export interface RouteParts {
  dep: string;
  stops: string[];
  dest: string;
}

/** An instrument procedure picked at a point of the route (the route's
 *  Procedures), said in the box after the point's pill: its field, its
 *  kind, its chart's title made short ("ILS Y 08 · LAX") and in full. */
export interface RouteProcedure {
  ident: string;
  kind: "approach" | "arrival" | "departure";
  /** Its coded identifier ("I09L") and, an approach's, the runway it
   *  lands on (approachRunway), none for one circling only. */
  id: string;
  runway: string | null;
  label: string;
  spoken: string;
  /** The fix ATC sent the airplane direct to, and the procedure's fixes it
   *  could be sent to (ProcedureMenu). */
  direct?: string | null;
  fixes?: BranchFix[];
}

const PROCEDURE_GLYPH = { approach: PlaneLanding, arrival: Route, departure: PlaneTakeoff } as const;

/**
 * The route as ForeFlight's is: one box, every point of it a pill in the
 * order flown -- the departure, the airports landed at and the waypoints
 * flown through, the destination -- an arrow between each two. A tap on an
 * arrow types a stop in there; what is typed after the destination goes
 * on to it, the old destination a stop on the way (or, with none yet,
 * names it); the airports and
 * waypoints that answer what is typed are offered under the box as it is
 * typed (Enter takes the first, or what was typed, "VPBNG 06C"). A pill is
 * dragged into another order, tapped to change, and taken out from its
 * menu -- any of them, the departure and the destination too: the next
 * airport along becomes the end taken out, and a route of two keeps the
 * other end, half a route. From Fly via, on the flight the Class B stops
 * (`via`), the ways round are offered before anything is typed. Every
 * change re-plans at once, so there is no Load button.
 *
 * The search bar's field, as Maps' is, round at a line's ends to sit in
 * the sheet's round corners.
 *
 * The ends stay airports: a waypoint is flown through, never taken off
 * from or landed at, so a change that would put one at an end is undone.
 */
/** How far past the box's width its pills must reach before it counts as
 *  running on, px: past a hit area's reach, short of a pill. */
const RUNS_ON_PX = 8;

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
}: RouteParts & {
  /** Which points are waypoints, flown through: in the sectional's magenta. */
  waypoints: Set<string>;
  /** An airport's airspace class, as the course came with it. */
  airspaceOf: (ident: string) => AirspaceClass | undefined;
  /** An airport's METAR colour, for the pills coloured by the weather. */
  metarColourOf: (ident: string) => string | undefined;
  /** The altitude at a point, which its menu offers to change: a
   *  waypoint's cruise there, an airport's pattern. */
  altitudeAt: (ident: string, waypoint: boolean) => PointAltitude;
  /** A point's own altitude set, or (null) given back to the plan. */
  onAltitudeChange: (ident: string, feet: number | null) => void;
  onChange: (route: RouteParts) => void;
  /** SIDs and STARs typed among the points ("BAEE1", lib/procedures'
   *  TYPED_PROCEDURE), taken out of them, for the route's procedures to
   *  pick, with the route they were typed into. */
  onTypedProcedures?: (typed: TypedProcedure[], route: { dep: string; dest: string }) => void;
  /** A stop asked for from elsewhere -- a problem's Add a stop or Fly
   *  via: the box takes the typing where it goes in, with `via` offered. */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Fly via's waypoints round the Class B, best first. */
  via?: Detour[];
  /** The procedures picked, after their fields' pills, and the way to the
   *  route's Procedures from one. */
  procedures?: RouteProcedure[];
  onProcedures?: (procedure: RouteProcedure) => void;
  /** An airport's pill tapped: its card (PlaceCard), at the pilot's ask,
   *  the airport changed from the pill's menu instead. A waypoint's tap
   *  is still its search: it has no card. */
  onOpenAirport?: (ident: string) => void;
  /** The point flown direct to, and Direct to one or (null) the route as
   *  it was (PlanWorkspace's directToPoint): the pill's menu's, as FPL's. */
  directTo?: string | null;
  onDirectTo?: (ident: string | null) => void;
  /** The fuel stops the planner suggests for a flight too long for its
   *  tanks (the totals' fuel_stops), dashed after the flight's departure
   *  until added; a tap adds them, as FPL's Add fuel stop does. */
  fuelStops?: FuelStopSuggestion[];
  onKeepFuelStops?: (after: string, idents: string[]) => void;
  /** A suggested fuel stop taken out of the box, the pilot not wanting it
   *  (its menu's Remove); the route's menu or FPL's Routes put it back. */
  onHideFuelStop?: (ident: string) => void;
  /** The route's buttons -- the airplane, the altitude, the Brief, the nav
   *  log and Share -- in the box under its lines, as a message box has its
   *  own under what is typed, at the owner's ask ("I want the route box
   *  with the buttons below it like this", 2026-10-21). */
  footer?: ReactNode;
  /** Where a stop asked for (`adding`) is typed in, before the point at
   *  this place: FPL's list's Add a Stop and Add a Stop After, where the
   *  list changes the route (lib/preferences RouteEdit). None, before the
   *  destination, or where Fly via goes round the Class B. */
  addAt?: number | null;
  /** The box folded again, at its Done, where a whole route's box is
   *  folded away (RouteEdit's "folded"): opened from its line, the box
   *  takes the typing at once. */
  onDone?: () => void;
  /** A point the planner does not know (usePlan's `unknownPlace`): its
   *  pill in red, a tap on it the search to change it, and a line under
   *  the box saying so with Remove -- where it happened, not the map's
   *  problem line (CLAUDE.md, the FPL audit's A2). Its ident null where
   *  the planner's answer named none. */
  unknownPoint?: { ident: string | null } | null;
}) {
  const hasDep = !!dep,
    hasDest = !!dest;
  const points = [...(hasDep ? [dep] : []), ...stops, ...(hasDest ? [dest] : [])];
  const roleOf = (i: number) => (i === 0 && hasDep ? "dep" : i === points.length - 1 && hasDest ? "dest" : "stop");
  const [typed, setTyped] = useState("");
  // The field taken, for the arrow on from the destination (below).
  const [focused, setFocused] = useState(false);
  const typedNow = useRef(typed);
  useEffect(() => {
    typedNow.current = typed;
  }, [typed]);
  const field = useRef<HTMLInputElement>(null);
  // The box, which the suggestions are placed under (their popover's
  // anchor) and a press in which is not one outside them.
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  // Where the field is: before point `at` (a stop typed in there, or at 0
  // with no departure, the departure), or null -- after the last point,
  // where what is typed is the destination.
  const [chosen, setAt] = useState<number | null>(null);
  // The point whose altitude is being set, from its menu.
  const [editing, setEditing] = useState<EditedPoint | null>(null);
  // Asked for from a problem: the field where the stop goes -- on the
  // flight the Class B stops, or before the destination.
  const asked = addAt !== null ? addAt : via?.length ? via[0]!.stop_index + 1 : Math.max(points.length - 1, 0);
  // With no departure yet, the field is there first: half a route reads
  // "Departure -> KDLH", the departure still to be typed.
  const at = chosen ?? (adding ? asked : !hasDep && points.length ? 0 : null);
  const atNow = useRef(at);
  useEffect(() => {
    atNow.current = at;
  }, [at]);
  // Each point's key is its place in the order and its ident: the same
  // airport twice is two points.
  const ids = points.map((p, i) => `${i}:${p}`);
  const isEnd = (ident: string) => (!!identOf(ident) && !waypoints.has(ident)) || isPosition(ident);
  const full = stops.length >= MAX_STOPS;

  // A list of points back into the route's parts, the ends kept where they
  // were. No end a waypoint, no more stops than the planner takes, and no
  // point straight after itself (KDLH, KDLH, KMDW) -- but a route of one
  // airport twice is let through, to be said (PlanWorkspace's notice) and
  // changed here.
  const change = (list: string[], withDep = hasDep, withDest = hasDest) => {
    const d = withDep && list.length ? list[0]! : "";
    const a = withDest && list.length > (d ? 1 : 0) ? list.at(-1)! : "";
    const route = { dep: d, stops: list.slice(d ? 1 : 0, a ? list.length - 1 : list.length), dest: a };
    const repeats = list.some((p, i) => i > 0 && p === list[i - 1]) && list.length !== 2;
    if ((d && !isEnd(d)) || (a && !isEnd(a)) || route.stops.length > MAX_STOPS || repeats) return;
    onChange(route);
    return route;
  };
  // Taken out: the next airport along becomes the end taken out; of two,
  // the other end stays, half a route; the last, no route.
  const remove = (i: number) => {
    const list = points.filter((_, j) => j !== i);
    const role = roleOf(i);
    if (list.length === 1 && role !== "stop") {
      change(list, role === "dest", role === "dep");
      return;
    }
    change(list, hasDep && (role !== "dep" || isEnd(list[0] ?? "")), hasDest && (role !== "dest" || isEnd(list.at(-1) ?? "")));
  };
  // What was typed, put in where the field is: before a point, as stops
  // (the departure, with none, when it is an airport); after the last, the
  // route goes on to it -- the last airport typed the destination, the old
  // destination and anything typed before it stops on the way (a
  // waypoint typed there is a stop before the destination: a flight does
  // not end at one).
  // Into an empty box -- the route cleared -- the first airport typed is
  // the departure, and the field asks for the destination next, at the
  // pilot's ask; more than one typed at once, on to the last.
  // A SID or a STAR typed among them ("KMSP BAEE1 BAE ... OSH OSHH2
  // KATW") is the route's procedure, not a point: taken out, with the
  // points typed either side of it, and picked once the route is in.
  const put = (typedIdents: string[]) => {
    const words = typedIdents.map((t) => t.trim().toUpperCase()).filter(Boolean);
    const isProcedure = (word: string) => TYPED_PROCEDURE.test(word) && !!onTypedProcedures;
    const typedProcedures = words.flatMap((word, i) =>
      isProcedure(word)
        ? [
            {
              name: word,
              before:
                words
                  .slice(0, i)
                  .reverse()
                  .find((w) => !isProcedure(w)) ?? null,
              after: words.slice(i + 1).find((w) => !isProcedure(w)) ?? null,
            },
          ]
        : [],
    );
    const fresh = words
      .filter((w) => !isProcedure(w))
      .map(stopOf)
      .filter(Boolean);
    const route = placed(fresh) ?? { dep, dest };
    if (typedProcedures.length) onTypedProcedures?.(typedProcedures, { dep: route.dep, dest: route.dest });
  };
  const placed = (fresh: string[]) => {
    if (!fresh.length) return;
    if (!points.length) return change(fresh, isEnd(fresh[0]!), fresh.length > 1 && isEnd(fresh.at(-1)!));
    const where = atNow.current;
    if (where !== null) {
      const departure = where === 0 && !hasDep && isEnd(fresh[0]!);
      const route = change([...points.slice(0, where), ...fresh, ...points.slice(where)], hasDep || departure, hasDest);
      setAt(where + fresh.length);
      return route;
    }
    if (!isEnd(fresh.at(-1)!)) return change([...points.slice(0, hasDest ? -1 : undefined), ...fresh, ...(hasDest ? [dest] : [])]);
    return change([...points, ...fresh], hasDep, true);
  };
  const commitTyped = () => {
    put(typedNow.current.split(/[\s,]+/));
    setTyped("");
  };
  // One picked from the suggestions: in, the field empty for the next, the
  // typing kept in it; an airport among the recents, as the search bar's.
  const pick = (ident: string, airport?: RecentAirport) => {
    if (airport) usePreferences.getState().addRecentAirport(airport);
    put([ident]);
    setTyped("");
    onAddingChange(false);
    field.current?.focus();
  };
  // The field to a place: an arrow's, or back after the last point.
  const typeAt = (where: number | null) => {
    setAt(where);
    setTyped("");
    // Once it is there: a tap's focus within the tap (iOS brings the
    // keyboard up for no other).
    queueMicrotask(() => field.current?.focus());
  };
  // A tap on the box's empty room -- not a pill, an arrow or the field --
  // puts the field after the last point, as a tap past a text field's
  // words puts the caret at their end, at the pilot's ask: what was typed
  // at an arrow put in first, as a tap away from it would. Pressed, the
  // field keeps the focus, the keyboard staying up.
  const slide = useRef<HTMLDivElement>(null);
  // One row, at the owner's ask (2026-11-04: "FPL can be fixed as one
  // row, in which ids can slide etc. even when routes have more fixes
  // than the space in the row"): the box keeps one line's height whatever
  // the route, and the pills slide sideways under a finger. Whether they
  // run on past either end -- Base UI's ScrollArea says so on its
  // viewport (data-overflow-x-start / -end), read as the box or its pills
  // change and as it is slid -- for the fade at each edge that says there
  // is more there.
  // The pills' row (ScrollArea.Content): its room types at the end (isRoom).
  const slideRow = useRef<HTMLDivElement>(null);
  // The field taken, and each point typed into it: the row slid to its
  // end, where the field and the new point are. Not as it opens -- a
  // route arrives a point at a time as it loads, which slid it there --
  // where it shows the route from its departure.
  const pointCount = points.length;
  useEffect(() => {
    const el = slide.current;
    if (el && focused && at === null) el.scrollTo({ left: el.scrollWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pointCount, focused, at]);
  const isRoom = (e: MouseEvent<HTMLDivElement>) =>
    e.target === e.currentTarget || e.target === slide.current || e.target === slideRow.current;
  // A finger's 44 points round each pill, as iOS gives a control: the
  // pills are 28 tall in a row that clips them (it slides sideways), so
  // their own ::after could not reach, and a tap 8 points over or under
  // one landed on the box, which started typing a new destination (the
  // FPL audit's A18). A tap on the box's room, or the footer's, within
  // 22 points of a pill's middle and across it is that pill's.
  const pillNear = (e: MouseEvent<HTMLDivElement>): HTMLElement | null => {
    const el = slide.current;
    if (!el) return null;
    for (const pill of el.querySelectorAll<HTMLElement>("[data-point]")) {
      const r = pill.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && Math.abs(e.clientY - (r.top + r.height / 2)) <= 22) return pill;
    }
    return null;
  };
  const toEnd = (e: MouseEvent<HTMLDivElement>) => {
    const footerRoom = (e.target as HTMLElement).dataset.testid === "route-box-footer";
    if (!isRoom(e) && !footerRoom) return;
    const near = pillNear(e);
    if (near) {
      near.querySelector<HTMLElement>("button")?.click();
      return;
    }
    if (!isRoom(e)) return;
    if (atNow.current === null || (atNow.current === 0 && !hasDep)) {
      field.current?.focus();
      return;
    }
    if (typedNow.current.trim()) commitTyped();
    onAddingChange(false);
    typeAt(null);
  };

  // The airports and waypoints that answer what is typed, under the box;
  // before anything is typed, Fly via's ways round. Put away with Escape
  // or a tap elsewhere, until the next thing typed.
  const { rows, answered } = useAirportSearch(typed, !!typed.trim(), true);
  // Room under the suggestions' last row for a phone's keyboard, as the
  // airport picker's sheet has, so they scroll up above it: the window's
  // reading, as the popover is on the body, out of the Drawer's viewport.
  const keyboard = useKeyboardInset();
  // The pilot's own point off a fix, typed as a flight plan writes one
  // ("VPBNG/090/30", at the owner's ask): offered first, as it reads.
  const ownPoint = stopOf(typed) && frdOf(stopOf(typed)) ? stopOf(typed) : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const offering = typed.trim() ? rows.length > 0 || !!ownPoint : adding && !!via?.length;
  const open = offering && dismissed !== typed;
  // Asked for, the field takes the typing.
  useEffect(() => {
    if (adding) field.current?.focus();
  }, [adding]);
  // Opened from its folded line, the same: in the tap's own commit, so iOS
  // brings the keyboard up (it does for no focus after the tap).
  const opened = !!onDone;
  useLayoutEffect(() => {
    if (opened) field.current?.focus();
  }, [opened]);
  // Folded again: what is typed put in first, as leaving the box does,
  // and not again as the field's blur comes after the box has gone.
  const done = () => {
    if (typedNow.current.trim()) commitTyped();
    typedNow.current = "";
    atNow.current = null;
    onAddingChange(false);
    onDone?.();
  };

  const lit = useRef(false); // a suggestion lit now (the list's own highlight)
  const onKeyDown = (e: BaseUIEvent<KeyboardEvent<HTMLInputElement>>) => {
    if (e.key === "Enter") {
      // The first suggestion, once they answer what is typed (the list's
      // own Enter, on its highlighted row); else what was typed -- but what is
      // no row's ident (a town's name, "madison", or a short one, "reno",
      // which stopOf takes for an ident) takes the first airport shown at
      // once, before the planner's waypoints answer: it was put in as
      // typed, which is nothing, and the box emptied.
      const word = typed.trim().toUpperCase();
      const exact = rows.some((r) => r.ident === word);
      if (open && rows.length > 0 && (answered || !exact)) {
        // The list takes Enter on its highlighted row, the first lit as the
        // rows come (autoHighlight "always", as the one search's). Typed key
        // by key, as a phone's keyboard does, rows that come after the last
        // change of what is typed can be none lit (the FPL audit's A1,
        // 2026-11-08): then the first row shown is the one Return takes, as
        // Maps' search does, from the rows themselves -- an airport first,
        // as the list shows them, else a waypoint.
        if (!lit.current) {
          const first = rows.find((r) => r.kind !== "fix") ?? rows[0]!;
          e.preventDefault();
          e.preventBaseUIHandler();
          if (first.kind === "fix") pick(first.ident);
          else pick(first.ident, { ident: first.ident, name: first.name, municipality: first.municipality });
          return;
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (typed.trim()) commitTyped();
    } else if (e.key === " " || e.key === ",") {
      if (!typed.trim()) return;
      e.preventDefault();
      commitTyped();
    } else if (e.key === "Escape" && at !== null) {
      typeAt(null);
      onAddingChange(false);
    } else if (e.key === "Backspace" && !typed) {
      // As a token field does: the point before the caret goes -- after
      // the last, the destination; an arrow's field is put away.
      if (at !== null) typeAt(null);
      else if (points.length) remove(points.length - 1);
    }
  };

  // The list's own field (Base UI's Autocomplete), which keeps its arrows
  // and Enter on the suggestions while they are out. After the last point it fills the rest
  // of the line, so a tap anywhere after the destination types there; at
  // an arrow, a stop's width.
  const typing = (
    <>
      <CommandField
        ref={field}
        onKeyDown={onKeyDown}
        // Out only while the suggestions are: the list is always "open"
        // to Base UI (inline), its popover the box's own.
        aria-expanded={open}
        // Idents, not anything AutoFill knows (the iOS audit's P19).
        autoComplete="off"
        // What was typed goes in when the box is left -- unless a suggestion
        // took the tap, which empties it first -- and an arrow's field is
        // put away.
        onFocus={() => setFocused(true)}
        onBlur={() =>
          window.setTimeout(() => {
            setFocused(false);
            if (document.activeElement === field.current) return;
            if (typedNow.current.trim()) commitTyped();
            if (atNow.current !== null) {
              setAt(null);
              onAddingChange(false);
            }
          }, 200)
        }
        // Empty, the route, from its departure (put); then each end it lacks.
        // After a whole route's destination no words, at the pilot's ask
        // ("Add stop" said it): what is typed there is the new destination,
        // the old one a stop on the way, as Maps' Add Stop does, and a reader
        // is told so (its label).
        placeholder={!points.length ? "Route" : at === null ? (hasDest ? "" : "Destination") : at === 0 && !hasDep ? "Departure" : ""}
        aria-label={
          !points.length
            ? "The route, from its departure"
            : at === null
              ? hasDest
                ? "Add stop, the new destination"
                : "The destination"
              : at === 0 && !hasDep
                ? "The departure"
                : "A stop here"
        }
        enterKeyHint="done"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        // 16 at the least below md, as every field is: under 16 iOS zooms
        // the page in on it (checkpoints.spec checks every field). Not
        // TEXT.row, whose 14 with a mouse would be under it on a narrow
        // window; 17 to a finger, a row's, and 14 from md up.
        className={cn(
          "h-7 bg-transparent font-mono text-base uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground md:text-sm pointer-coarse:text-(length:--type-row)",
          // The departure's field wide enough for its word: at a stop's width
          // it read "Departu".
          // After the last point, clear of it, as a field's words are of
          // its edge: its words ran into the destination's pill. With no
          // words after a whole route, and not being typed in, as narrow as
          // the room left on the route's line, none at all where the line is
          // full: at 48 it took a second line of its own, empty, under four
          // points, and at 24 still did under a procedure's chip and three
          // fields (the owner's recording, 2026-10-18). A tap on the box's
          // room past the last point is still its (below).
          at === null
            ? // The caret a space nearer the arrow before it, at the owner's ask
              // ("the cursor can be one space less for next entry").
              cn("flex-1 pl-1", hasDest && points.length > 0 && !focused && !typed ? "min-w-0 pl-0" : "min-w-12")
            : cn("shrink-0 rounded-full bg-background/60 px-2", at === 0 && !hasDep ? "w-28" : "w-20"),
        )}
        data-testid="route-type"
      />
      {/* What is typed cleared, the field kept, as iOS's fields clear:
          Base UI's own clear, through the root's onValueChange. */}
      <CommandClear render={<ClearButton label="Clear what is typed" className={at === null ? "mr-1" : undefined} />} />
    </>
  );
  // An arrow between two points: the one search asked for a stop there (useStopAsked); a plain one either side of an open field.
  const { oneSearch, askAt } = useStopAsked({ points, hasDep, hasDest, isEnd, change });
  const arrow = (before: number) =>
    at === before ? (
      <Fragment key={`at-${before}`}>
        {before > 0 && <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
        {typing}
        <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Fragment>
    ) : (
      <button
        key={`arrow-${before}`}
        type="button"
        disabled={full && !(before === 0 && !hasDep)}
        onClick={() => (oneSearch ? askAt(before) : typeAt(before))}
        data-testid="route-arrow"
        aria-label={before === 0 ? "Add the departure" : `Add a stop between ${points[before - 1]} and ${points[before]}`}
        className="grid h-5 w-4 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:text-tint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <ArrowRight className="size-3" />
      </button>
    );
  return (
    // The list's root (Base UI's Autocomplete) round the box and its
    // suggestions: the field moves the highlight with the arrows and takes
    // it with Enter.
    <CommandRoot
      value={typed}
      onValueChange={(v) => setTyped(v.toUpperCase())}
      autoHighlight="always"
      onItemHighlighted={(item) => {
        lit.current = item !== undefined;
      }}
    >
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the presses and keys of the pills and the field inside it, caught as they bubble (as cmdk's root caught them). */}
      <div
        className="min-w-0"
        // Delete (or Backspace) on a focused pill takes it out, as its menu
        // does (Pill).
        onKeyDown={(event) => {
          const point = (event.target as HTMLElement).dataset.point;
          if (point === undefined || (event.key !== "Delete" && event.key !== "Backspace")) return;
          event.preventDefault();
          remove(Number(point));
        }}
      >
        <Popover
          open={open}
          onOpenChange={(next, details) => {
            // A press in the box is not outside: it types there.
            if (!next && details.reason === "outside-press" && boxEl?.contains(details.event.target as Node)) {
              details.cancel();
              return;
            }
            if (!next) {
              setDismissed(typed);
              onAddingChange(false);
            }
          }}
        >
          {/* The search bar's field, as Maps' is with no route: its grey, no line round it, its corners round, the
             pills on it in the sheet's own colour -- one line tall, a second as the route needs it, at the pilot's
             ask, where it was two however short the route and a short one left a line of grey empty under it. */}
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
              "h-auto flex-wrap items-start rounded-(--radius-banner) border-0 pt-1 pb-0 pr-1.5 pl-1 shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0",
              !footer && "pb-1",
              PANEL_FIELD,
            )}
            data-testid="route-box"
          >
            {/* The pills in one row that slides sideways under a finger when the route is longer than the box (the
               owner, 2026-11-04), as ForeFlight's flight plan box does; the end faded where it runs on, so a point
               past it reads as there. A drag up or down on it is the sheet's (the Drawer's swipe), across is the row's. */}
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
                <ScrollArea.Content ref={slideRow} className="flex flex-nowrap items-center gap-x-px py-1 pr-2 [&>*]:shrink-0">
                  {/* Each point a pill, tapped or held for its menu (Pill); moved
                  by its menu's Move Up and Down, or dragged in FPL's list. */}
                  {points.map((point, i) => (
                    <Fragment key={ids[i]}>
                      {/* Before the first point an arrow only with no
                      departure yet: the departure is typed there. */}
                      {(i > 0 || !hasDep) && arrow(i)}
                      {/* Its arrival and approach before it, as they are
                      flown into it, at the owner's ask ("I want to show
                      the approach pill before the corresponding airport
                      pill"); its departure after it (below). A tap opens
                      the Procedures they were picked in. Not points of
                      the route: not dragged, not typed. */}
                      {i === points.findIndex((p) => p === point) &&
                        procedures
                          .filter((p) => sameField(p.ident, point) && p.kind !== "departure")
                          .sort((a, b) => (a.kind === "arrival" ? 0 : 1) - (b.kind === "arrival" ? 0 : 1))
                          .map((p) => (
                            <ProcedureChip
                              key={`${p.kind}-${p.label}`}
                              procedure={p}
                              before
                              onOpen={onProcedures ? () => onProcedures(p) : undefined}
                            />
                          ))}
                      <Pill
                        // A place earlier or later: the two neighbours swapped.
                        onStep={(by) => change(points.map((p, j) => (j === i ? points[i + by]! : j === i + by ? point : p)))}
                        last={i === points.length - 1}
                        ident={point}
                        waypoint={waypoints.has(point)}
                        index={i}
                        airspaceOf={airspaceOf}
                        metarColourOf={metarColourOf}
                        role={roleOf(i)}
                        stopNumber={i + (hasDep ? 0 : 1)}
                        onChange={(ident) => change(points.map((p, j) => (j === i ? ident : p)))}
                        altitude={altitudeAt(point, waypoints.has(point))}
                        onEditAltitude={() =>
                          setEditing({ ident: point, waypoint: waypoints.has(point), altitude: altitudeAt(point, waypoints.has(point)) })
                        }
                        onRemove={() => remove(i)}
                        unknown={unknownPoint?.ident === point}
                        onOpen={
                          onOpenAirport && !waypoints.has(point) && identOf(point) && unknownPoint?.ident !== point
                            ? () => onOpenAirport(identOf(point))
                            : undefined
                        }
                        // Flown to: a stop or the destination, not where it starts.
                        direct={directTo !== null && sameField(directTo, point)}
                        onDirect={
                          onDirectTo && i > 0 && hasDep
                            ? () => onDirectTo(directTo !== null && sameField(directTo, point) ? null : point)
                            : undefined
                        }
                      />
                      {i === points.findIndex((p) => p === point) &&
                        procedures
                          .filter((p) => sameField(p.ident, point) && p.kind === "departure")
                          .map((p) => (
                            <ProcedureChip
                              key={`${p.kind}-${p.label}`}
                              procedure={p}
                              onOpen={onProcedures ? () => onProcedures(p) : undefined}
                            />
                          ))}
                      {/* The fuel stops suggested for the flight that leaves
                      this point, dashed after it as the route goes on
                      to them (FuelStopChip). */}
                      {i < points.length - 1 &&
                        i === points.findIndex((p) => p === point) &&
                        fuelStops
                          .filter((f) => sameField(f.departure, point))
                          .slice(0, 1)
                          .flatMap((f) =>
                            f.stops.map((stop) => (
                              <Fragment key={`fuel-${stop.ident}`}>
                                <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <FuelStopChip
                                  ident={stop.ident}
                                  reason={f.reason}
                                  onAdd={
                                    onKeepFuelStops
                                      ? () =>
                                          onKeepFuelStops(
                                            point,
                                            f.stops.map((s) => s.ident),
                                          )
                                      : undefined
                                  }
                                  onHide={onHideFuelStop ? () => onHideFuelStop(stop.ident) : undefined}
                                />
                              </Fragment>
                            )),
                          )}
                    </Fragment>
                  ))}
                  {/* After the last point: the destination typed, or changed.
                  With none yet, an arrow on to it; with one, an arrow on from
                  it while the field is taken, at the pilot's ask -- what is
                  typed there is the new destination, the old one a stop. */}
                  {at === null && (
                    <>
                      {points.length > 0 && (!hasDest || focused || !!typed) && (
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" data-testid="route-arrow-on" />
                      )}
                      {typing}
                    </>
                  )}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
            </ScrollArea.Root>
            {/* The route is cleared from its ••• menu, not a ✕ here (the
                owner, 2026-11-11, ShareMenu's Clear route). */}
            {/* Folded again, as iOS's Done ends an edit: the box's first line
                at its end. Pressed, the field keeps the focus till it goes. */}
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
                and the last button's apart (the iOS audit's P1: at eight,
                the refresh's 32-point button took a point of the clear's). */}
            {footer && (
              <div className="flex w-full basis-full items-center pt-2.5 pr-0.5 pb-2 pl-1.5" data-testid="route-box-footer">
                {footer}
              </div>
            )}
          </InputGroup>
          {/* The airport search's own list (AirportResults), its rows and
            groups as the picker's sheet has them, under the box: the typing
            stays in the box, where the picker's sheet from the top would
            take the focus to a field of its own. As tall as there is room,
            the sheet's list as long. */}
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
            <AirportResults
              rows={typed.trim() ? rows : NO_ROWS}
              answered={!typed.trim() || answered}
              onAirport={(airport) => pick(airport.ident, airport)}
              onWaypoint={(ident) => pick(ident)}
            >
              {!typed.trim() && via && via.length > 0 && (
                <PickerGroup heading="Suggested">
                  {via.map((d) => (
                    <AirportRow
                      key={d.ident}
                      waypoint
                      testId="picker-suggestion"
                      onSelect={() => pick(d.ident)}
                      airport={{
                        ident: d.ident,
                        name: d.kind,
                        municipality: [`+${Math.round(d.added_nm)} nm`, d.description].filter(Boolean).join(" · "),
                      }}
                    />
                  ))}
                </PickerGroup>
              )}
              {ownPoint && (
                <PickerGroup heading="Your point">
                  <AirportRow
                    waypoint
                    airport={{ ident: ownPoint, name: frdWords(ownPoint) }}
                    onSelect={() => pick(ownPoint)}
                    testId="route-own-point"
                  />
                </PickerGroup>
              )}
            </AirportResults>
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
    </CommandRoot>
  );
}

const NO_PROCEDURES: RouteProcedure[] = [];
const NO_ROWS: AirportSearchRow[] = [];
const NO_FUEL_STOPS: FuelStopSuggestion[] = [];

/** The pilot's own point as words: "30 nm on 090° from VPBNG". */
function frdWords(ident: string): string {
  const frd = frdOf(ident);
  return frd ? `${frd.distanceNm} nm on ${bearing(frd.course)} from ${frd.base}` : ident;
}

/** A fuel stop suggested and not yet in the route (the totals' fuel_stops), in the
 *  box: a small button dashed in the caution's colour with the pump; a tap its menu, to
 *  add it to the route or take it out of the box, at the owner's ask
 *  ("Fuel stops should also have a way to delete them and add them back as
 *  pleased", 2026-10-24). A stop added is the route's own, taken out by its
 *  pill's menu as any stop is, and suggested again if the tanks need it. */
function FuelStopChip({
  ident,
  reason = "fuel",
  onAdd,
  onHide,
}: {
  ident: string;
  reason?: "fuel" | "break";
  onAdd?: () => void;
  onHide?: () => void;
}) {
  // A break on a long flight the tanks hold wears a cup, not the pump.
  const Glyph = reason === "break" ? Coffee : Fuel;
  // The stock small Button (the owner, 2026-11-10), outlined dashed in the
  // caution's colour with the pump: suggested, not yet in the route. A
  // finger's 44 round it by a pseudo-element, the button not grown.
  const look = "relative border-dashed border-caution text-caution-ink after:absolute after:-inset-y-1.5 after:inset-x-0";
  const face = (
    <>
      <Glyph aria-hidden="true" data-icon="inline-start" />
      {ident}
    </>
  );
  const words = `Suggested ${reason === "break" ? "stop" : "fuel stop"} ${ident}`;
  if (!onHide) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onAdd}
        disabled={!onAdd}
        data-testid="route-fuel-stop"
        aria-label={`${words}: add it to the route`}
        className={look}
      >
        {face}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" data-testid="route-fuel-stop" aria-label={words} className={look} />}
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {onAdd && (
          <DropdownMenuItem onClick={onAdd} data-testid="route-fuel-stop-add">
            <Plus />
            Add to Route
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onHide} data-testid="route-fuel-stop-remove">
          <Trash2 />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A procedure picked at a point, after its pill: its kind's glyph and its
 *  short title in the approaches' indigo, as the map draws it
 *  (ProceduresGl). */
function ProcedureChip({
  procedure,
  before = false,
  onOpen,
}: {
  procedure: RouteProcedure;
  /** Before its field's pill (an arrival, an approach), not after it. */
  before?: boolean;
  onOpen?: () => void;
}) {
  const Glyph = PROCEDURE_GLYPH[procedure.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="route-procedure"
      aria-label={`${procedure.spoken}: the route's procedures`}
      className={cn(
        before ? "relative mr-1" : "relative ml-1",
        "inline-flex h-7 shrink-0 after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] items-center gap-1 rounded-full px-1 font-semibold whitespace-nowrap text-procedure outline-none focus-visible:ring-2 focus-visible:ring-ring",
        TEXT.note,
      )}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      {procedure.label}
    </button>
  );
}

/** One point of the route: its ident in its airspace's look, a tap to
 *  change it (the picker), and a drag to move it. Taken out from its own
 *  menu, as iOS takes things out -- a press and hold on a phone, a
 *  right-click with a mouse -- or Delete with it focused: a cross on every
 *  pill was a row of targets crowded between them, at the pilot's ask. Any
 *  of them, the ends too (RouteBox's `remove`). */
function Pill({
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
    <ContextMenu>
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
