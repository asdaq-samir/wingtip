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

/**
 * A menu dragged down by a finger from the top of its list follows the
 * finger and closes when let go far enough down, as a sheet does, where
 * only a tap outside it or a pick closed it (the owner, 2026-11-26: "Just
 * make common code", every menu at once). Touch events, not pointer ones:
 * the list scrolls (overflow-y), and once the browser takes a drag for
 * its scroll it cancels the pointer's events, where a touchmove can still
 * be held from the scroll (not passive) while the list is at its top. The
 * close is Base UI's own (`close`), its exit as any close's; the menu's
 * picks are untouched, as a moved touch is no tap.
 */
export function useDragClose(): (node: HTMLElement | null) => (() => void) | undefined {
  const actions = useContext(MenuActions);
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || !actions) return undefined;
      let from = 0;
      let by = 0;
      let atTop = false;
      let dragging = false;
      const start = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        from = event.touches[0]!.clientY;
        by = 0;
        atTop = node.scrollTop <= 0;
        dragging = false;
      };
      const move = (event: TouchEvent) => {
        if (!atTop || event.touches.length !== 1) return;
        by = event.touches[0]!.clientY - from;
        if (by <= 0) {
          // Back up past where it began: the list's own scroll again.
          if (dragging) node.style.translate = "";
          dragging = false;
          return;
        }
        event.preventDefault();
        dragging = true;
        node.style.transition = "none";
        node.style.translate = `0 ${by}px`;
      };
      const end = () => {
        if (!dragging) return;
        dragging = false;
        // Closed, it fades out where the finger left it; kept, it eases back.
        if (by >= CLOSE_PAST_PX) {
          node.style.transition = "";
          actions.current?.close();
          return;
        }
        node.style.transition = "translate var(--motion-fade) var(--motion-sheet-ease)";
        node.style.translate = "";
      };
      node.addEventListener("touchstart", start, { passive: true });
      node.addEventListener("touchmove", move, { passive: false });
      node.addEventListener("touchend", end);
      node.addEventListener("touchcancel", end);
      return () => {
        node.removeEventListener("touchstart", start);
        node.removeEventListener("touchmove", move);
        node.removeEventListener("touchend", end);
        node.removeEventListener("touchcancel", end);
      };
    },
    [actions],
  );
}
