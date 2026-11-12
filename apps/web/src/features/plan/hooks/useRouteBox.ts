import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { TokenFieldValue } from "react-aria-components";
import { setTokenFieldSelection } from "react-aria-components/TokenField";
import type { Detour } from "../../../lib/api/types";
import { frdOf, identOf, isPosition, MAX_STOPS, stopOf } from "../../../lib/identSchema";
import { prefersReducedMotion } from "../../../lib/motion";
import { usePreferences, type RecentAirport } from "../../../lib/preferences";
import type { TypedProcedure } from "../../../lib/procedures";
import { useAirportSearch } from "../../../lib/useAirportSearch";
import { pointsOf, readTyped, roleAt, routeOf, withoutPoint, withTyped, type RouteParts } from "../components/routeBox/routeEdit";
import { caretBefore, endedWords, removedPoint, routeValue, samePoints, takeTyped, tokensOf, typedOf, type RouteValue } from "../components/routeBox/routeTokens";
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
  onDone,
}: RouteParts & {
  waypoints: Set<string>;
  onChange: (route: RouteParts) => void;
  onTypedProcedures?: (typed: TypedProcedure[], route: { dep: string; dest: string }) => void;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  via?: Detour[];
  addAt: number | null;
  onDone?: () => void;
}) {
  const [value, setValue] = useState(() => routeValue(pointsOf({ dep, stops, dest })));
  // The route the box shows: the plan's, or the one the box last sent until
  // the plan has it -- the plan takes a change in a transition, the field
  // its tokens at once, and the two must say the same points.
  const [shownRoute, setShownRoute] = useState<RouteParts>({ dep, stops, dest });
  const given = `${dep}|${stops.join(",")}|${dest}`;
  const [shownGiven, setShownGiven] = useState(given);
  if (shownGiven !== given) {
    // The route changed elsewhere -- FPL's list, the map, a pill's menu, a
    // plan opened -- or the box's own change came back: its tokens again
    // where they differ, what is typed kept before the same point.
    setShownGiven(given);
    setShownRoute({ dep, stops, dest });
    const planned = pointsOf({ dep, stops, dest });
    if (!samePoints(tokensOf(value), planned)) {
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
  const shape = { points, hasDep, hasDest, isEnd };
  const roleOf = (i: number) => roleAt(shape, i);
  const full = shownRoute.stops.length >= MAX_STOPS;
  // The field (TokenInput's editable element), and the box's row that
  // slides sideways (Base UI's ScrollArea viewport) and its content.
  const field = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const slideRow = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  // The value now, for the field's blur, which acts once a tap elsewhere
  // has had its say.
  const valueNow = useRef(value);
  useEffect(() => {
    valueNow.current = value;
  }, [value]);

  const change = (list: string[], withDep = hasDep, withDest = hasDest) => {
    const route = routeOf(list, withDep, withDest, isEnd);
    if (route) send(route);
    return route;
  };
  const remove = (i: number) => {
    const route = withoutPoint(shape, i);
    if (route) send(route);
  };
  // Words typed, put in before point `at` (null: after the last), the
  // field's value then `rest`'s: what is still typed kept, the caret
  // after what went in. The SIDs and STARs among them go to the route's
  // procedures, with the route they were typed into.
  const put = (words: string[], at: number | null, rest: RouteValue) => {
    const { fresh, procedures } = readTyped(words, !!onTypedProcedures);
    const placed = fresh.length ? withTyped(shape, fresh, at) : null;
    const route = placed?.route ?? null;
    if (route) send(route);
    const typed = typedOf(rest);
    const shown = routeValue(route ? pointsOf(route) : points, typed.text, route ? placed!.next : typed.at, rest);
    // Now, not once React has drawn it: a commit straight after this one --
    // the field's blur after Return, Done after a word -- finds nothing
    // typed, where it put the same words in a second time (KMSP the
    // destination and a stop, KMSN both ends of a cleared route).
    valueNow.current = shown;
    setValue(shown);
    if (procedures.length) onTypedProcedures?.(procedures, { dep: route?.dep ?? shownRoute.dep, dest: route?.dest ?? shownRoute.dest });
  };
  // Everything typed, put in where it was typed: false where nothing was.
  const commit = (from: RouteValue = valueNow.current) => {
    const taken = takeTyped(from);
    if (taken) put(taken.words, taken.at, taken.rest);
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
      if (ended.words.length) put(ended.words, ended.at, ended.rest);
      else setValue(ended.rest);
      return;
    }
    const list = tokensOf(next);
    if (samePoints(list, points)) {
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

  // The caret before point `at` (null: after the last), the field taken:
  // within a tap's own handler, as iOS brings the keyboard up for no
  // other focus.
  const focusAt = (at: number | null) => {
    const el = field.current;
    if (!el) return;
    el.focus();
    setTokenFieldSelection(el, new TokenFieldValue.SelectedRange(caretBefore(valueNow.current, at)), true);
  };
  // With no departure yet, the caret goes before the first point: half a
  // route reads "Departure -> KDLH", the departure still to be typed.
  const startAt = !hasDep && points.length ? 0 : null;
  // Taken by Tab or from elsewhere, not by a press (which puts the caret
  // where it pressed): the caret where the box types next, as a field's
  // focus puts it after its words. An editable element puts it at its
  // start, and TokenField has no option for it (react-spectrum #10671).
  const pressed = useRef(false);
  const onFocus = () => {
    setFocused(true);
    const byPress = pressed.current;
    pressed.current = false;
    if (!byPress && field.current) setTokenFieldSelection(field.current, new TokenFieldValue.SelectedRange(caretBefore(valueNow.current, startAt)), true);
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

  // One picked from the suggestions: in where it was typed, the typing
  // kept in the field for the next; an airport among the recents, as the
  // search bar's.
  const pick = (ident: string, airport?: RecentAirport) => {
    if (airport) usePreferences.getState().addRecentAirport(airport);
    put([ident], typed.at, routeValue(tokensOf(value), "", typed.at, value));
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

  // A point's menu (its pill's ContextMenu) from the keyboard, as a hold
  // or a right-click opens it: at the pill's foot.
  const openMenu = (pill: HTMLElement) => {
    const r = pill.getBoundingClientRect();
    pill.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom }));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-point]");
    // Delete (or Backspace) on a focused pill takes it out, as its menu
    // does; Enter opens its menu.
    if (pill && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      remove(Number(pill.dataset.point));
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
    pressed.current = false;
    window.setTimeout(() => {
      setFocused(false);
      if (document.activeElement === field.current) return;
      commit();
      if (adding) onAddingChange(false);
    }, 200);
  };

  // A tap on the box's empty room -- not a pill, an arrow or the field --
  // puts the caret after the last point, as a tap past a text field's
  // words puts it at their end, at the pilot's ask: what was typed among
  // the points put in first, as a tap away from it would. Pressed, the
  // field keeps the focus, the keyboard staying up.
  const isRoom = (e: MouseEvent<HTMLDivElement>) =>
    e.target === e.currentTarget || e.target === slide.current || e.target === slideRow.current;
  // A finger's 44 points round each pill, as iOS gives a control: the
  // pills are 28 tall in a row that clips them (it slides sideways), so
  // their own ::after could not reach, and a tap 8 points over or under
  // one landed on the box, which started typing a new destination (the
  // FPL audit's A18). A tap on the box's room, or the footer's, within
  // 22 points of a pill's middle and across it is that pill's.
  const pillNear = (e: MouseEvent<HTMLDivElement>): HTMLElement | null => {
    for (const pill of slide.current?.querySelectorAll<HTMLElement>("[data-point]") ?? []) {
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
    if (typed.at === null || (typed.at === 0 && !hasDep)) {
      focusAt(typed.at);
      return;
    }
    commit();
    onAddingChange(false);
    focusAt(null);
  };

  // A tap in the field past its last point and what is typed: the caret
  // after them, as a tap past a field's words puts it. WebKit put it before
  // the first point, the field's own element hit there, not a word.
  const onFieldClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = field.current;
    if (!el || e.target !== el) return;
    const words = document.createRange();
    words.selectNodeContents(el);
    const right = Math.max(...[...words.getClientRects()].map((r) => r.right));
    if (e.clientX >= right) setTokenFieldSelection(el, new TokenFieldValue.SelectedRange(caretBefore(valueNow.current, null)), true);
  };

  // An arrow between two points: the one search asked for a stop there
  // (useStopAsked); the caret there where none is drawn.
  const { oneSearch, askAt } = useStopAsked({ points, hasDep, hasDest, isEnd, change });
  const arrowAt = (before: number) => (oneSearch ? askAt(before) : focusAt(before));

  // Asked for from a problem -- on the flight the Class B stops, FPL's
  // Add a Stop, or before the destination: the caret where the stop goes.
  const asked = addAt !== null ? addAt : via?.length ? via[0]!.stop_index + 1 : Math.max(points.length - 1, 0);
  const askedNow = useEffectEvent(() => focusAt(asked));
  useEffect(() => {
    if (adding) askedNow();
  }, [adding]);
  // Opened from its folded line, the same: in the tap's own commit, so iOS
  // brings the keyboard up (it does for no focus after the tap).
  const opened = !!onDone;
  const openedNow = useEffectEvent(() => focusAt(startAt));
  useLayoutEffect(() => {
    if (opened) openedNow();
  }, [opened]);
  // Idents, typed in capitals, not words for the keyboard to correct; its
  // Return says Done. TokenInput passes no such props, so they are the
  // element's own.
  useLayoutEffect(() => {
    field.current?.setAttribute("autocapitalize", "characters");
    field.current?.setAttribute("enterkeyhint", "done");
  }, []);
  // The field taken, and each point typed into it: the row slid to its
  // end, where the caret and the new point are. Not as it opens -- a route
  // arrives a point at a time as it loads, which slid it there -- where it
  // shows the route from its departure.
  const pointCount = points.length;
  useEffect(() => {
    const el = slide.current;
    if (el && focused && typed.at === null) el.scrollTo({ left: el.scrollWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pointCount, focused, typed.at]);

  // Folded again: what is typed put in first, as leaving the box does,
  // and not again as the field's blur comes after the box has gone.
  const done = () => {
    commit();
    valueNow.current = routeValue(points);
    onAddingChange(false);
    onDone?.();
  };
  const clearTyped = () => setValue(routeValue(points, "", typed.at, value));

  return {
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
    onPress: () => {
      pressed.current = true;
    },
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
    suggestions: { open, rows: text ? rows : [], answered: !text || answered, via: !text ? (via ?? []) : [], ownPoint, pick },
    dismiss: () => {
      setDismissed(text);
      onAddingChange(false);
    },
  };
}
