import { useRef, useState, type KeyboardEvent } from "react";
import { sameFields, useLatest } from "../../lib/steady";
import type { Detour } from "../../lib/api/types";
import { frdOf, identOf, isPosition, MAX_STOPS, stopOf } from "../../lib/identSchema";
import { usePreferences, type RecentAirport } from "../../lib/preferences";
import { useCruiseKeys } from "../../lib/address";
import { sameField, type TypedProcedure } from "../../lib/procedures";
import { engineLoaded } from "../../lib/engine/engine";
import { useAirportSearch } from "../../lib/useAirportSearch";
import { pointsOf, readTyped, roleAt, routeOf, withoutPoint, withTyped, type RouteParts } from "./routeEdit";
import { releaseTyped } from "./routeEdit";
import { endedWords, removedPoint, routeValue, takeTyped, tokensOf, typedOf } from "./routeTokens";
import type { RouteValue } from "./routeTokens";
import { useRouteCaret } from "./useRouteCaret";
import { useStopAsked } from "./useStopAsked";

/**
 * The route box's state and edits (RouteBox draws them): the route's
 * points as the tokens of React Aria's TokenField, what is typed among
 * them, and every change the box makes to the route by its rules
 * (routeEdit). The field is the stock one: the caret goes anywhere among
 * the points, Backspace takes the point before it, Undo puts it back. A
 * word ended by a space or a comma goes in where it was typed; what is
 * left typed goes in at Enter, at Done and when the box is left.
 */
export function useRouteBox({
  dep,
  stops,
  dest,
  waypoints,
  onChange,
  onTypedProcedures,
  adding,
  onAddingChange,
  via,
  addAt,
}: RouteParts & {
  waypoints: Set<string>;
  onChange: (route: RouteParts) => void;
  onTypedProcedures?: (typed: TypedProcedure[], route: { dep: string; dest: string }) => void;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  via?: Detour[];
  addAt: number | null;
}) {
  const [value, setValue] = useState(() => routeValue(pointsOf({ dep, stops, dest })));
  // The route the box shows: the plan's, or the one the box last sent until
  // the plan has it -- the plan takes a change in a transition, the field
  // its tokens at once, and the two must say the same points.
  const [shownRoute, setShownRoute] = useState<RouteParts>({ dep, stops, dest });
  const given = `${dep}|${stops.join(",")}|${dest}`;
  const [shownGiven, setShownGiven] = useState(given);
  // The destination as typed, while the plan names it by its field's ICAO
  // ident (useRouteTidy: "OSH" typed is KOSH as an end): typed on past, it
  // is the point typed again (withTyped's typedDest), not a stop at KOSH.
  const [typedDest, setTypedDest] = useState<{ ident: string; typed: string } | null>(null);
  if (shownGiven !== given) {
    // The route changed elsewhere -- FPL's list, the map, a pill's menu, a
    // plan opened -- or the box's own change came back: its tokens again
    // where they differ, what is typed kept before the same point.
    setShownGiven(given);
    // Named anew is the same field (the engine's same_field, which the
    // renaming itself asks, so with no engine yet nothing was renamed).
    const renamed = !!shownRoute.dest && !!dest && dest !== shownRoute.dest && engineLoaded() && sameField(dest, shownRoute.dest);
    setTypedDest(
      renamed
        ? { ident: dest, typed: typedDest?.ident === shownRoute.dest ? typedDest.typed : shownRoute.dest }
        : typedDest?.ident === dest
          ? typedDest
          : null,
    );
    setShownRoute({ dep, stops, dest });
    const planned = pointsOf({ dep, stops, dest });
    if (!sameFields(tokensOf(value), planned)) {
      const typed = typedOf(value);
      setValue(routeValue(planned, typed.text, typed.at, value));
    }
  }
  const send = (route: RouteParts) => {
    setShownRoute(route);
    onChange(route);
  };
  const hasDep = !!shownRoute.dep,
    hasDest = !!shownRoute.dest;
  const points = pointsOf(shownRoute);
  const isEnd = (ident: string) => (!!identOf(ident) && !waypoints.has(ident)) || isPosition(ident);
  const shape = { points, hasDep, hasDest, isEnd, typedDest: typedDest?.ident === shownRoute.dest ? typedDest.typed : null };
  const roleOf = (i: number) => roleAt(shape, i);
  const full = shownRoute.stops.length >= MAX_STOPS;
  // The field (TokenInput's editable element), and the box's row that
  // slides sideways (Base UI's ScrollArea viewport) and its content.
  const field = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const slideRow = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  // The value now, for the field's blur, which acts after a tap elsewhere.
  const valueNowRef = useLatest(value);

  const change = (list: string[], withDep = hasDep, withDest = hasDest) => {
    const route = routeOf(list, withDep, withDest, isEnd);
    if (route) send(route);
    return route;
  };
  // Whether the box would take a new list (routeOf: each point where it
  // may go), for the moves its pills' menus offer.
  const canChange = (list: string[]) => routeOf(list, hasDep, hasDest, isEnd) !== null;
  const remove = (i: number) => {
    const route = withoutPoint(shape, i);
    if (route) send(route);
  };
  // Words typed, put in before point `at` (null: after the last), `rest` the field's; their SIDs and STARs picked (releaseTyped).
  const held = useRef<TypedProcedure[]>([]);
  const [, setCruise] = useCruiseKeys();
  const put = (words: string[], at: number | null, rest: RouteValue, done: boolean) => {
    const { fresh, procedures, words: read, cruiseFt, goesOn } = readTyped(words, !!onTypedProcedures);
    // A filed route's speed and level group sets the cruise, as the
    // altitude's own field does (useRouteEdits' flyAltitude).
    if (cruiseFt !== null) void setCruise({ altitude_ft: cruiseFt, altitude_nearest: false, altitude_choice: null });
    const ready = releaseTyped(held, read, procedures, done);
    const placed = fresh.length ? withTyped(shape, fresh, at, goesOn) : null;
    const route = placed?.route ?? null;
    if (route) send(route);
    const typed = typedOf(rest);
    const shown = routeValue(route ? pointsOf(route) : points, typed.text, route ? placed!.next : typed.at, rest);
    // Now, not once React has drawn it: a commit straight after this one --
    // the field's blur after Return, Done after a word -- finds nothing
    // typed, where it put the same words in a second time (KMSP the
    // destination and a stop, KMSN both ends of a cleared route).
    valueNowRef.current = shown;
    setValue(shown);
    if (ready.length) onTypedProcedures?.(ready, { dep: route?.dep ?? shownRoute.dep, dest: route?.dest ?? shownRoute.dest });
  };
  // Everything typed, put in where it was typed: false where nothing was.
  const commit = (from: RouteValue = valueNowRef.current) => {
    const taken = takeTyped(from);
    if (taken) put(taken.words, taken.at, taken.rest, true);
    return !!taken;
  };

  // The field's own change: a word ended goes in; a point gone from the
  // tokens (Backspace, Delete, a cut) or back (Undo, a paste) is the
  // route's change, by the box's rules, its tokens put right where the
  // rules say no; anything else -- a letter typed, the caret moved -- the
  // field's.
  const onValue = (next: RouteValue) => {
    const ended = endedWords(next);
    if (ended) {
      if (ended.words.length) put(ended.words, ended.at, ended.rest, false);
      else setValue(ended.rest);
      return;
    }
    const list = tokensOf(next);
    if (sameFields(list, points)) {
      setValue(next);
      return;
    }
    const typed = typedOf(next);
    // Typed over points selected -- a select-all and a word, as a test's
    // fill does -- takes none out: the box's input held only what was
    // typed until it was a TokenField, and the route goes only by
    // Backspace, Delete or a point's menu, the whole of it by the route's
    // ••• menu (Clear route, the owner, 2026-11-11). What was typed goes
    // where the selection began, after the last point where it was all of
    // them.
    if (list.length < points.length && typed.text !== typedOf(value).text) {
      setValue(routeValue(points, typed.text, list.length ? typed.at : null, next, true));
      return;
    }
    const gone = removedPoint(points, list);
    const route = gone !== null ? withoutPoint(shape, gone) : routeOf(list, hasDep, hasDest, isEnd);
    if (route) send(route);
    // In the field's undo history as the edit itself, so one Undo puts
    // the point back.
    setValue(routeValue(route ? pointsOf(route) : points, typed.text, typed.at, next, true));
  };

  const typed = typedOf(value);
  const text = typed.text.trim().toUpperCase();
  // The airports and waypoints that answer what is typed, under the box;
  // before anything is typed, Fly via's ways round. Put away with Escape
  // or a tap elsewhere, until the next thing typed.
  const { rows, answered } = useAirportSearch(text, !!text, true);
  // The pilot's own point off a fix, typed as a flight plan writes one
  // ("VPBNG/090/30", at the owner's ask): offered first, as it reads.
  const ownPoint = stopOf(text) && frdOf(stopOf(text)) ? stopOf(text) : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const offering = text ? rows.length > 0 || !!ownPoint : adding && !!via?.length;
  const open = offering && dismissed !== text;

  // One picked from the suggestions: in where it was typed, the field kept
  // for the next; an airport among the recents, as the search bar's.
  const pick = (ident: string, airport?: RecentAirport) => {
    if (airport) usePreferences.getState().addRecentAirport(airport);
    put([ident], typed.at, routeValue(tokensOf(value), "", typed.at, value), true);
    onAddingChange(false);
    field.current?.focus();
  };
  // Return with no row lit (the list takes it on a lit row): the first row
  // shown, once the rows answer what is typed -- an airport first, as the
  // list shows them, else a waypoint, as Maps' search does (the FPL
  // audit's A1, 2026-11-08: typed key by key, as a phone's keyboard does,
  // rows that come after the last change can be none lit). What is no
  // row's ident (a town's name, "madison", or a short one, "reno", which
  // stopOf takes for an ident) takes the first airport shown at once,
  // before the planner's waypoints answer; else what was typed goes in.
  const onSubmit = () => {
    const exact = rows.some((r) => r.ident === text);
    if (open && rows.length > 0 && (answered || !exact)) {
      const first = rows.find((r) => r.kind !== "fix") ?? rows[0]!;
      if (first.kind === "fix") pick(first.ident);
      else pick(first.ident, { ident: first.ident, name: first.name, municipality: first.municipality });
      return;
    }
    commit();
  };

  // A point's menu (its pill's DropdownMenu, RoutePill) from the keyboard,
  // as a tap opens it: the pill is the menu's trigger.
  const openMenu = (pill: HTMLElement) => pill.click();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-point]");
    // Delete (or Backspace) on a focused pill takes it out, as its menu
    // does; Enter opens its menu; the arrows go from pill to pill in the
    // route's order, as a toolbar's buttons do (WAI-ARIA's roving focus).
    if (pill && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      remove(Number(pill.dataset.point));
    } else if (pill && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const pills = [...(field.current?.querySelectorAll<HTMLElement>("[data-point]") ?? [])];
      pills[pills.indexOf(pill) + (e.key === "ArrowLeft" ? -1 : 1)]?.focus();
    } else if (e.key === "Enter") {
      // A point selected in the field (Shift and an arrow, or a tap on its
      // token by a reader), or its pill focused: its menu, not Return's.
      const selected = pill ? [pill] : [...(field.current?.querySelectorAll<HTMLElement>("[data-selected] [data-point]") ?? [])];
      if (selected.length !== 1) return;
      e.preventDefault();
      openMenu(selected[0]!);
    } else if (e.key === "Escape") {
      setDismissed(text);
      onAddingChange(false);
    }
  };
  // What was typed goes in when the box is left -- unless a suggestion
  // took the tap, which empties it first.
  const onBlur = () => {
    unpress();
    window.setTimeout(() => {
      setFocused(false);
      if (document.activeElement === field.current) return;
      commit();
      if (adding) onAddingChange(false);
    }, 200);
  };

  const { focusAt, onFocus, onPress, unpress, isRoom, toEnd, onFieldClick } = useRouteCaret({
    field,
    slide,
    slideRow,
    valueNow: valueNowRef,
    points,
    hasDep,
    typedAt: typed.at,
    focused,
    setFocused,
    commit,
    adding,
    onAddingChange,
    addAt,
    via,
  });

  // A point's Insert Before or After (its pill's menu), or the missing
  // departure's word: the one search asked for a point there
  // (useStopAsked); the caret there where none is drawn.
  const { oneSearch, askAt } = useStopAsked({ points, hasDep, hasDest, isEnd, change });
  const insertAt = (before: number) => (oneSearch ? askAt(before) : focusAt(before));

  const clearTyped = () => setValue(routeValue(points, "", typed.at, value));

  return {
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
    focused,
    typed,
    clearTyped,
    field,
    slide,
    slideRow,
    toEnd,
    isRoom,
    insertAt,
    suggestions: { open, rows: text ? rows : [], answered: !text || answered, via: !text ? (via ?? []) : [], ownPoint, pick },
    dismiss: () => {
      setDismissed(text);
      onAddingChange(false);
    },
  };
}
