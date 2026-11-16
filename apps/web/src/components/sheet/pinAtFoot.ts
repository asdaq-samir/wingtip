import { useEffect, type RefObject } from "react";
import { MOTION } from "../../lib/tokens";
import { usePanelDragging } from "../../lib/mapChrome";

/** How long a sheet takes to come to rest at a size, a frame to spare. */
const SETTLE_MS = MOTION.drawer * 1000 + 50;

/**
 * A row of a sheet's head that is its pill: held on the edge of the
 * sheet's foot (`foot`, a selector) while the sheet rests at the pill
 * (`held`), and as the sheet goes down riding with it to there and staying
 * while the rest of the sheet slides on down under it; the other way,
 * waiting there as the sheet comes up until its own place reaches it (the
 * owner, 2026-11-16, of FPL's figures: "calculations should sit at the
 * bottom after sliding and then just stay there while the fpl slides
 * down"). One copy at every size, so nothing is handed over at the pill:
 * every flicker at the end of a pull down came from handing FPL's figures
 * from a second copy at the pill to this one (the owner, 2026-11-16:
 * "Maybe having common code will remove the bugs from fpl?").
 *
 * The foot is held at the sheet's visible edge at every size (SheetParts'
 * FOLLOW), so its resting edge is read each frame, not remembered: the
 * window's own foot is behind Safari's floating toolbar.
 *
 * By the row's transform alone, nothing laid out again or built: a frame
 * at a time while a finger has the sheet (SheetDrawer's usePanelDragging)
 * or it comes to rest at the pill, then again only if the page's layout
 * changes there; let go once it has settled at another size (`on` false:
 * at once, not this sheet's way now). data-pinned while held, for the row's own look
 * (FplRoute's PINNED: in sight at the pill, where the rest of the head is
 * not).
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, foot: string, { on, held }: { on: boolean; held: boolean }) {
  const dragging = usePanelDragging((d) => d.dragging);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const letGo = () => {
      row.style.transform = "";
      row.dataset.shift = "0";
      row.removeAttribute("data-pinned");
    };
    if (!on) return letGo();
    let frame = 0;
    const place = () => {
      const edge = restingEdge(document.querySelector<HTMLElement>(foot));
      // Where it would be unpinned, its transform taken off.
      const below = row.getBoundingClientRect().bottom - Number(row.dataset.shift ?? 0) - edge;
      const shift = below > 0 ? -below : 0;
      row.dataset.shift = String(shift);
      row.style.transform = shift ? `translateY(${shift}px)` : "";
      row.toggleAttribute("data-pinned", shift < 0);
    };
    const until = dragging ? Infinity : performance.now() + SETTLE_MS;
    // Raised from the pill without a drag (a tap on it), held on through
    // the settle as through a drag's, then let go.
    const step = () => {
      place();
      if (performance.now() < until) frame = requestAnimationFrame(step);
      else if (!held) letGo();
    };
    step();
    // At rest at the pill: again whenever the route's rows change height.
    const resized = dragging || !held ? null : new ResizeObserver(place);
    const page = row.closest("[data-sheet-scroll]");
    if (resized && page) resized.observe(page.firstElementChild ?? page);
    return () => {
      cancelAnimationFrame(frame);
      resized?.disconnect();
    };
  }, [dragging, held, on, foot, ref]);
}

/** Where the foot's edge is once the sheet is at rest: its place now with
 *  its own and the sheet's transforms taken off, which cancel at rest (the
 *  foot is moved back by the sheet's offset, SheetParts' FOLLOW). As the
 *  sheet settles the two are eased apart, the Drawer's and the foot's, so
 *  its place now wobbled the held row by up to 6 points at a pull down's
 *  end (measured on the live build in Chromium at iPhone size, 2026-11-16).
 */
function restingEdge(foot: HTMLElement | null) {
  if (!foot) return window.innerHeight;
  const moved = (el: Element | null) => (el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0);
  return foot.getBoundingClientRect().bottom - moved(foot) - moved(foot.closest(".group\\/sheet"));
}
