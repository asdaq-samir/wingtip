import { create } from "zustand";
import type { PanelState } from "../../lib/mapChrome";
import { coverCard, useSheetCards } from "../../lib/sheetCards";
import { shownPx } from "./insets";
import { prefersReducedMotion } from "../../lib/motion";
import { MOTION } from "../../lib/tokens";

/** The room over a phone's bottom sheet's top edge, while there is one:
 *  the riding buttons' one container (OnSheetTop's portal), put in the
 *  front sheet's slot (MapPanel's, else the riding card's, CardStack);
 *  and the cards that have finished coming up (for the map's room,
 *  map/cardRoom). */
export const useSheetTop = create<{ slot: HTMLElement | null; up: string[] }>(() => ({ slot: null, up: [] }));

/** A card's drawer has finished opening or closing (the Drawer's
 *  onOpenChangeComplete). */
export function cardSettled(id: string, open: boolean) {
  useSheetTop.setState((s) => {
    const up = s.up.filter((card) => card !== id);
    return { up: open ? [...up, id] : up };
  });
}

/**
 * The card whose top the map's buttons ride, null for the sheet's: of the
 * cards whose drawers are open, the one that covers the map most
 * (coverCard), so they are never drawn over a higher card's content at a
 * lower card's top (the owner's iPhone, 2026-11-12). A card takes them in
 * the commit it opens in, as Apple Maps' place card takes over its sheet:
 * it comes up where the front sheet's top already is (CardStack's
 * frontOffset), so they stay where they were and ride it from there. Once
 * they waited for the card to finish sliding up from the screen's foot,
 * hidden meanwhile so the card did not slide under them; they went and
 * came back at every card (the owner's iPhone, 2026-11-13: "redrawing").
 */
export function useRidingCard(): string | null {
  return useSheetCards((s) => coverCard(s.stack, (entry) => entry.at !== undefined)?.id ?? null);
}

/** The Drawer's own offset of the front sheet's popup, the sheet's or the
 *  riding card's (--drawer-snap-point-offset, in the sheet's frame:
 *  CardStack's cards are placed from it), where a card opening now comes
 *  up from; none with no bottom sheet. */
export function frontOffset(): string | undefined {
  const popup = useSheetTop.getState().slot?.parentElement?.parentElement;
  return popup?.style.getPropertyValue("--drawer-snap-point-offset") || undefined;
}

/** The one container the riding buttons are drawn in, moved from slot to
 *  slot. A portal into a new container is a new subtree to React: when a
 *  card opened and the buttons moved to its top, the map's buttons were
 *  drawn afresh and lost what they held -- the Map button's card closed
 *  as it opened (the owner, 2026-11-11, measured in WebKit: aria-expanded
 *  true, then false). The same element moved in the page keeps them. */
let riding: HTMLDivElement | null = null;
/** The surface the slot they left was on, for the one they go to in the
 *  same commit (glideFrom). */
let left: Surface | null = null;

/** The front sheet's slot's ref (SheetDrawer's, CardStack's): one
 *  function, so React does not take it away and put it back at each of
 *  their renders. */
export function sheetTopRef(node: HTMLDivElement | null) {
  if (!node) return;
  if (!riding) {
    riding = document.createElement("div");
    riding.style.display = "contents";
  }
  const kept = riding;
  glideFrom(node, left);
  left = null;
  node.appendChild(kept);
  useSheetTop.setState({ slot: kept });
  return () => {
    // Read before React takes the slot off the page: no layout, its
    // surface's size and drag as the page and the Drawer have set them.
    left = surfaceOf(node);
    // One slot goes as the next comes in the same commit (the sheet's as a
    // card opens): left set while it is put in again, so nothing is drawn
    // afresh; with no slot after it, the buttons go back over the map.
    queueMicrotask(() => {
      left = null;
      if (!kept.isConnected) useSheetTop.setState({ slot: null });
    });
  };
}

/** A front surface the buttons ride, the sheet's or a card's: the size it
 *  rests at (its popup's data-panel, MapPanel's and CardStack's) and how
 *  far a finger has it from there (Base UI's --drawer-swipe-movement-y). */
type Surface = { at: PanelState; moved: number };

const SIZES: readonly string[] = ["peek", "half", "full"];

function surfaceOf(slot: HTMLElement): Surface | null {
  const popup = slot.parentElement;
  const at = popup?.dataset.panel;
  if (!popup || !at || !SIZES.includes(at)) return null;
  return { at: at as PanelState, moved: parseFloat(popup.style.getPropertyValue("--drawer-swipe-movement-y")) || 0 };
}

/** Handed to a front sheet at another height -- a card put away over a
 *  sheet lower or higher than it -- the buttons glide there on the
 *  Drawer's time and curve (design/tokens motion.drawer), rather than
 *  jumping. A card opening comes up where they are, so they do not move:
 *  its drawer's popup is still hidden in the commit it opens in, not yet
 *  where it comes up (WebKit at 390x844, 2026-11-13: measured at the
 *  screen's top, the buttons thrown off the screen's foot). How far is the
 *  difference of the two surfaces' heights in sight at their sizes
 *  (shownPx), and the drag the one they left was under: both popups stand
 *  on the same viewport's foot. It was read off the slot they left, which
 *  was at times a popup drawn anew and hidden, measured at the screen's
 *  top, and the buttons swept down from off the screen as a card closed
 *  (the flicker audit, 2026-11-14, FL-2). */
function glideFrom(node: HTMLElement, was: Surface | null) {
  const popup = node.parentElement;
  const now = surfaceOf(node);
  if (!was || !now || !popup || popup.hidden || prefersReducedMotion() || typeof node.animate !== "function") return;
  // All the way up they are out of sight (index.css): they come and go
  // there, never swept across the screen from a top above it.
  if (was.at === "full" || now.at === "full") return;
  const height = popup.offsetHeight;
  if (!height) return;
  const by = shownPx(now.at, true, height) - shownPx(was.at, true, height) + was.moved - now.moved;
  if (Math.abs(by) < 1) return;
  node.animate([{ transform: `translateY(${by}px)` }, { transform: "none" }], {
    duration: MOTION.drawer * 1000,
    easing: `cubic-bezier(${MOTION.drawerEase.join(",")})`,
  });
}
