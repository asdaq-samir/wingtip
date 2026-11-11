import { useLayoutEffect, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { halfPx } from "./insets";

/** The Drawer's own offset of a popup from its snap point (Base UI's
 *  --drawer-snap-point-offset, negative for a sheet from the top). */
const offsetOf = (popup: HTMLElement) => popup.style.getPropertyValue("--drawer-snap-point-offset");

/**
 * How much of the map the panel in sight covers, px, read from what the
 * stock Drawer has done rather than worked out beside it: on a phone the
 * front popup's height (the top card's, else the sheet's) less the
 * Drawer's own snap offset, half's height all the way up (what shows once
 * it comes down), and under a bottom sheet the room its viewport leaves
 * over the home indicator; from `md` up the side panel's own height, its
 * head alone at rest. Read again whenever the Drawer sets an offset or a
 * card's size changes (a MutationObserver on the popup) and when the popup
 * is resized (Safari's toolbar, a turn), never per frame of a drag.
 */
export function useSheetCover(sheet: HTMLElement | null, front: PanelState, onPhone: boolean, fromBottom: boolean): number {
  const [cover, setCover] = useState(0);
  useLayoutEffect(() => {
    if (!sheet) return;
    let last = "";
    const read = (always: boolean) => {
      if (!onPhone) return setCover(Math.round(sheet.offsetHeight));
      const cards = sheet.querySelectorAll<HTMLElement>("[data-sheet-card][data-top]");
      const popup = cards[cards.length - 1] ?? sheet;
      const offset = offsetOf(popup);
      const key = `${cards.length}|${offset}|${popup.dataset.panel ?? ""}`;
      if (!always && key === last) return;
      last = key;
      const height = popup.offsetHeight;
      const shown = front === "full" ? halfPx(height) : Math.max(0, height - Math.abs(parseFloat(offset) || 0));
      const viewport = sheet.parentElement;
      const below = fromBottom && viewport ? parseFloat(getComputedStyle(viewport).bottom) || 0 : 0;
      setCover(Math.round(shown + below));
    };
    read(true);
    const changes = new MutationObserver(() => read(false));
    changes.observe(sheet, { subtree: true, attributes: true, attributeFilter: ["style", "data-panel", "data-top"] });
    const resize = new ResizeObserver(() => read(true));
    resize.observe(sheet);
    return () => {
      changes.disconnect();
      resize.disconnect();
    };
  }, [sheet, front, onPhone, fromBottom]);
  return cover;
}
