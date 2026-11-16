import { useEffect, type RefObject } from "react";
import { usePanelDragging } from "../../lib/mapChrome";

/** How far over the screen's foot the pill's own copy of a row sits,
 *  measured whenever the pill is in sight; till then a sheet's edge room. */
let pillGap: number | null = null;
const EDGE_GAP = 8;

/**
 * A row of a sheet's head that, as the sheet goes down, rides with it to
 * the screen's foot and stays there while the rest of the sheet slides on
 * down under it, and the other way, waits at the foot as the sheet comes
 * up until its own place reaches it (the owner, 2026-11-16, of FPL's
 * figures: "calculations should sit at the bottom after sliding and then
 * just stay there while the fpl slides down"). Where it stops is where the
 * pill draws its own copy (`pill`, a selector), so at the pill the one is
 * handed to the other in the same place (PillHandover).
 *
 * Only while a finger has the sheet and it settles (SheetDrawer's
 * usePanelDragging), a frame at a time, by the row's transform alone:
 * nothing is laid out again or built. What it leaves at the end is the
 * size it settled at, none at half, so nothing is undone in sight.
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, pill: string) {
  const dragging = usePanelDragging((d) => d.dragging);
  useEffect(() => {
    const row = ref.current;
    if (!row || !dragging) return;
    let frame = 0;
    let shift = 0;
    const step = () => {
      const own = document.querySelector<HTMLElement>(pill);
      const shown = own?.getBoundingClientRect();
      if (shown?.height) pillGap = window.innerHeight - shown.bottom;
      // Where it would be unpinned, its transform taken off.
      const below = row.getBoundingClientRect().bottom - shift - (window.innerHeight - (pillGap ?? EDGE_GAP));
      shift = below > 0 ? -below : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
      row.toggleAttribute("data-pinned", shift < 0);
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [dragging, pill, ref]);
}
