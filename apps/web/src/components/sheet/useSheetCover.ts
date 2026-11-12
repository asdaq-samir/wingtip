import { useLayoutEffect, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { halfPx } from "./insets";

/** The Drawer's own offset of a popup from its snap point (Base UI's
 *  --drawer-snap-point-offset, negative for a sheet from the top). */
const offsetOf = (popup: HTMLElement) => popup.style.getPropertyValue("--drawer-snap-point-offset");

/**
 * How much of the map the panel in sight covers, px, read from what the
 * stock Drawer has done rather than worked out beside it: on a phone the
 * front popup's height (the card that covers the map most, else the sheet's) less the
 * Drawer's own snap offset, half's height all the way up (what shows once
 * it comes down), and under a bottom sheet the room its viewport leaves
 * over the home indicator; from `md` up the side panel's own height, its
 * head alone at rest. Read again whenever the Drawer sets an offset or a
 * card's size changes (a MutationObserver on the popup) and when the popup
 * is resized (Safari's toolbar, a turn), never per frame of a drag.
 * With it, whether what it measured was a card's: a card put away is
 * measured gone a moment after the page says so, and till then the room is
 * still the card's (the map keeps still for both, GlMapShell).
 */
export function useSheetCover(
  sheet: HTMLElement | null,
  front: PanelState,
  onPhone: boolean,
  fromBottom: boolean,
): { cover: number; card: boolean } {
  const [cover, setCover] = useState({ cover: 0, card: false });
  useLayoutEffect(() => {
    if (!sheet) return;
    let last = "";
    const read = (always: boolean) => {
      if (!onPhone) return setCover({ cover: Math.round(sheet.offsetHeight), card: false });
      const cards = sheet.querySelectorAll<HTMLElement>("[data-sheet-card][data-cover]");
      const popup = cards[cards.length - 1] ?? sheet;
      const offset = offsetOf(popup);
      const key = `${cards.length}|${offset}|${popup.dataset.panel ?? ""}`;
      if (!always && key === last) return;
      last = key;
      const height = popup.offsetHeight;
      const shown = front === "full" ? halfPx(height) : Math.max(0, height - Math.abs(parseFloat(offset) || 0));
      const viewport = sheet.parentElement;
      const below = fromBottom && viewport ? parseFloat(getComputedStyle(viewport).bottom) || 0 : 0;
      const next = Math.round(shown + below),
        card = popup !== sheet;
      setCover((was) => (was.cover === next && was.card === card ? was : { cover: next, card }));
    };
    read(true);
    const changes = new MutationObserver(() => read(false));
    changes.observe(sheet, { subtree: true, attributes: true, attributeFilter: ["style", "data-panel", "data-cover"] });
    const resize = new ResizeObserver(() => read(true));
    resize.observe(sheet);
    return () => {
      changes.disconnect();
      resize.disconnect();
    };
  }, [sheet, front, onPhone, fromBottom]);
  return cover;
}
