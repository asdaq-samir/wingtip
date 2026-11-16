import { useEffect, type RefObject } from "react";
import { usePanelDragging } from "../../lib/mapChrome";

/**
 * A row of a sheet's head that, as the sheet goes down, rides with it to
 * the screen's foot and stays there while the rest of the sheet slides on
 * down under it, and the other way, waits at the foot as the sheet comes
 * up until its own place reaches it (the owner, 2026-11-16, of FPL's
 * figures: "calculations should sit at the bottom after sliding and then
 * just stay there while the fpl slides down"). It stops on the edge of
 * the sheet's foot (`foot`, a selector), which is held at the sheet's
 * visible edge at every size (SheetParts' FOLLOW) and is where the pill
 * draws its own copy, so at the pill the one is handed to the other in the
 * same place (PillHandover). Read each frame, not remembered: the window's
 * own foot is behind Safari's floating toolbar, and the pill's copy is
 * not drawn at half, so a first pull down from half stopped the row 10
 * points low and it jumped up at the end (the owner's screen recording,
 * 2026-11-16: "It still seems a bit dynamic at the end?").
 *
 * Only while a finger has the sheet and it settles (SheetDrawer's
 * usePanelDragging), a frame at a time, by the row's transform alone:
 * nothing is laid out again or built; data-pinned while held, for the
 * row's own backing. Nothing is left held once the sheet has settled.
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, foot: string) {
  const dragging = usePanelDragging((d) => d.dragging);
  useEffect(() => {
    const row = ref.current;
    if (!row || !dragging) return;
    let frame = 0;
    let shift = 0;
    const step = () => {
      const edge = document.querySelector<HTMLElement>(foot)?.getBoundingClientRect().bottom ?? window.innerHeight;
      // Where it would be unpinned, its transform taken off.
      const below = row.getBoundingClientRect().bottom - shift - edge;
      shift = below > 0 ? -below : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
      row.toggleAttribute("data-pinned", shift < 0);
      frame = requestAnimationFrame(step);
    };
    step();
    // Let go once the sheet has settled: at half it is in place already,
    // and at the pill it is out of sight by then. Left held, a tap on the
    // pill raising the sheet to half (no drag, so no frame to undo it)
    // showed the row's room empty, its figures held below it (the
    // owner's iPhone, 2026-11-16).
    return () => {
      cancelAnimationFrame(frame);
      row.style.transform = "";
      row.removeAttribute("data-pinned");
    };
  }, [dragging, foot, ref]);
}
