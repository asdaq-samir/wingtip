import { useEffect, useEffectEvent, useLayoutEffect, useRef, type MouseEvent, type RefObject } from "react";
import { TokenFieldValue } from "react-aria-components";
import { setTokenFieldSelection } from "react-aria-components/TokenField";
import type { Detour } from "../../../lib/api/types";
import { prefersReducedMotion } from "../../../lib/motion";
import { caretBefore, type RouteValue } from "../components/routeBox/routeTokens";

/**
 * Where the route box's caret goes (useRouteBox): on a tap in the box's
 * room or past the field's words, on a focus not made by a press, where a
 * stop is asked for, as the box opens -- and the box's row slid to it.
 */
export function useRouteCaret({
  field,
  slide,
  slideRow,
  valueNow,
  points,
  hasDep,
  typedAt,
  focused,
  setFocused,
  commit,
  adding,
  onAddingChange,
  addAt,
  via,
  opened,
}: {
  field: RefObject<HTMLDivElement | null>;
  slide: RefObject<HTMLDivElement | null>;
  slideRow: RefObject<HTMLDivElement | null>;
  valueNow: RefObject<RouteValue>;
  points: string[];
  hasDep: boolean;
  /** Before which point is what is typed, or the caret (null: after the last). */
  typedAt: number | null;
  focused: boolean;
  setFocused: (focused: boolean) => void;
  commit: () => boolean;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  addAt: number | null;
  via?: Detour[];
  /** Opened from its folded line (RouteBox's onDone). */
  opened: boolean;
}) {
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
    if (!byPress && field.current)
      setTokenFieldSelection(field.current, new TokenFieldValue.SelectedRange(caretBefore(valueNow.current, startAt)), true);
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
    if (typedAt === null || (typedAt === 0 && !hasDep)) {
      focusAt(typedAt);
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

  // Asked for from a problem -- on the flight the Class B stops, FPL's
  // Add a Stop, or before the destination: the caret where the stop goes.
  const asked = addAt !== null ? addAt : via?.length ? via[0]!.stop_index + 1 : Math.max(points.length - 1, 0);
  const askedNow = useEffectEvent(() => focusAt(asked));
  useEffect(() => {
    if (adding) askedNow();
  }, [adding]);
  // Opened from its folded line, the same: in the tap's own commit, so iOS
  // brings the keyboard up (it does for no focus after the tap).
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
  }, [field]);
  // The field taken, and each point typed into it: the row slid to its
  // end, where the caret and the new point are. Not as it opens -- a route
  // arrives a point at a time as it loads, which slid it there -- where it
  // shows the route from its departure.
  const pointCount = points.length;
  useEffect(() => {
    const el = slide.current;
    if (el && focused && typedAt === null) el.scrollTo({ left: el.scrollWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [slide, pointCount, focused, typedAt]);

  return {
    focusAt,
    onFocus,
    onPress: () => {
      pressed.current = true;
    },
    unpress: () => {
      pressed.current = false;
    },
    isRoom,
    toEnd,
    onFieldClick,
  };
}
