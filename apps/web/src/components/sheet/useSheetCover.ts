import { useLayoutEffect, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { shownPx } from "./insets";

/**
 * How much of the map the panel in sight covers, px. On a phone, the
 * height in sight of the front surface (the card that covers the map most,
 * else the sheet) at the size the page holds for it, `front` -- half's all
 * the way up, what shows once it comes down -- by the Drawer's own snap
 * points (shownPx), and under a bottom sheet the room its viewport leaves
 * over the home indicator; from `md` up the side panel's own height, its
 * head alone at rest. The sheet measured again when it is resized
 * (Safari's toolbar, the keyboard, a turn), never per frame of a drag.
 *
 * Worked out from the size, not read off the front popup's snap offset:
 * Base UI writes that as 0 until the popup has measured itself, so each
 * card's first frame read as the card all the way up, and the map's
 * padding went 844 then 368 as every card opened, and through 0 as the
 * phone turned (the flicker audit, 2026-11-14, FL-4 and FL-17).
 */
export function useSheetCover(sheet: HTMLElement | null, front: PanelState, onPhone: boolean, fromBottom: boolean): number {
  // The sheet's height and, under a bottom sheet, the room its viewport
  // leaves at the foot: measured as they change. The cover is worked out
  // from them in the render the size changes in, so a card come or gone
  // and its room reach the map together (GlMapShell keeps the chart still
  // for that), never the room a render late, which the map eased to.
  const [box, setBox] = useState({ height: 0, below: 0 });
  useLayoutEffect(() => {
    if (!sheet) return;
    const read = () => {
      const viewport = sheet.parentElement;
      const below = onPhone && fromBottom && viewport ? parseFloat(getComputedStyle(viewport).bottom) || 0 : 0;
      const height = sheet.offsetHeight;
      setBox((was) => (was.height === height && was.below === below ? was : { height, below }));
    };
    read();
    const resize = new ResizeObserver(read);
    resize.observe(sheet);
    return () => resize.disconnect();
  }, [sheet, onPhone, fromBottom]);
  if (!onPhone) return Math.round(box.height);
  // Not yet laid out (hidden as the page opens): nothing to say yet.
  if (!box.height) return 0;
  return Math.round(shownPx(front === "full" ? "half" : front, fromBottom, box.height) + box.below);
}
