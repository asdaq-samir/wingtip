import { createContext, useCallback, useContext, useRef, type RefObject } from "react";
import type { Menu } from "@base-ui/react/menu";

/** The open menu's own actions (Base UI's `actionsRef`, its `close`), set by
 *  DropdownMenu and ContextMenu for their popups. */
export const MenuActions = createContext<RefObject<Menu.Root.Actions | null> | null>(null);

/** A menu's root's actions, the caller's where it holds them, and the
 *  context its popup reads them from. */
export function useMenuActions(own: RefObject<Menu.Root.Actions | null> | undefined) {
  const mine = useRef<Menu.Root.Actions | null>(null);
  return own ?? mine;
}

/** How far down a finger takes a menu for it to close when let go: past
 *  it, a close; short of it, the menu goes back where it was. */
const CLOSE_PAST_PX = 56;

/** A quicker throw than this, in points a millisecond, closes it however
 *  short: a flick says "away" as surely as a long pull (Emil Kowalski's
 *  Sonner threshold). */
const CLOSE_FLICK = 0.11;

/** How far a finger goes before the menu follows it: a tap's jitter on the
 *  top row stays a tap and keeps its pick (Apple's ~10 points of hysteresis
 *  before a drag, Designing Fluid Interfaces). */
const SLOP_PX = 8;

/** The menu's live vertical offset, mid-ease when caught again. */
function shownY(node: HTMLElement): number {
  const y = getComputedStyle(node).translate.split(" ")[1];
  return y ? Number.parseFloat(y) || 0 : 0;
}

/**
 * A menu dragged down by a finger from the top of its list follows the
 * finger and closes when let go far enough down or thrown, as a sheet does.
 * Touch events, not pointer ones: the list scrolls (overflow-y), and once
 * the browser takes a drag for its scroll it cancels the pointer's events,
 * where a touchmove can still be held from the scroll (not passive) while
 * the list is at its top. The close is Base UI's own (`close`), its exit as
 * any close's; a touch that never leaves the slop is untouched, so a tap
 * still picks.
 */
export function useDragClose(): (node: HTMLElement | null) => (() => void) | undefined {
  const actions = useContext(MenuActions);
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || !actions) return undefined;
      let from = 0;
      let at = 0;
      let by = 0;
      let byAt = 0;
      let atTop = false;
      let dragging = false;
      const start = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        // Caught while still easing back: it carries on from where it is
        // seen, with no slop, as the finger means to hold it.
        const caught = shownY(node);
        from = event.touches[0]!.clientY - caught;
        at = event.timeStamp;
        by = caught;
        byAt = caught;
        atTop = node.scrollTop <= 0;
        dragging = caught > 0;
        if (dragging) {
          node.style.transition = "none";
          node.style.translate = `0 ${caught}px`;
        }
      };
      const move = (event: TouchEvent) => {
        // Not once the list has scrolled under the finger: a scroll begun
        // cannot be taken back (its touchmove no longer cancelable), and
        // the menu moved while its list scrolled.
        if (!atTop || event.touches.length !== 1 || (!dragging && (!event.cancelable || node.scrollTop > 0))) return;
        const moved = event.touches[0]!.clientY - from;
        if (moved <= 0) {
          // Back up past where it began: the list's own scroll again.
          if (dragging) node.style.translate = "";
          dragging = false;
          by = 0;
          return;
        }
        if (!dragging && moved < SLOP_PX) return;
        if (!dragging) {
          // It takes up from the slop's edge, so it moves on from where it
          // is rather than jumping the slop's points.
          from += SLOP_PX;
          at = event.timeStamp;
          byAt = 0;
        }
        by = Math.max(0, event.touches[0]!.clientY - from);
        event.preventDefault();
        dragging = true;
        node.style.transition = "none";
        node.style.translate = `0 ${by}px`;
      };
      const end = (event: TouchEvent) => {
        if (!dragging) return;
        dragging = false;
        const speed = (by - byAt) / Math.max(1, event.timeStamp - at);
        // Closed, it fades out where the finger left it; kept, it eases back.
        if (by >= CLOSE_PAST_PX || speed > CLOSE_FLICK) {
          node.style.transition = "";
          actions.current?.close();
          return;
        }
        node.style.transition = "translate var(--motion-fade) var(--motion-sheet-ease)";
        node.style.translate = "";
      };
      // The touchmove that can hold a scroll is not passive, so the browser
      // waits on it before it scrolls: it is there only while the list is
      // at its top, where a drag down can begin, and a list scrolled down
      // scrolls as freely as any.
      let armed = false;
      const arm = () => {
        const want = node.scrollTop <= 0 || dragging;
        if (want === armed) return;
        armed = want;
        if (want) node.addEventListener("touchmove", move, { passive: false });
        else node.removeEventListener("touchmove", move);
      };
      node.addEventListener("scroll", arm, { passive: true });
      node.addEventListener("touchstart", start, { passive: true });
      node.addEventListener("touchend", end);
      node.addEventListener("touchcancel", end);
      arm();
      return () => {
        node.removeEventListener("scroll", arm);
        node.removeEventListener("touchstart", start);
        node.removeEventListener("touchmove", move);
        node.removeEventListener("touchend", end);
        node.removeEventListener("touchcancel", end);
      };
    },
    [actions],
  );
}
