import { useEffect, useLayoutEffect, type RefObject } from "react";
import { MOTION } from "../../lib/tokens";
import { usePanelDragging } from "../../lib/mapChrome";

/** How long a sheet takes to come to rest at a size, a frame to spare. */
const SETTLE_MS = MOTION.drawer * 1000 + 50;

/**
 * The row held by its CSS, as the sheet's foot is (sheet/insets'
 * HOLD_AT_EDGE): moved back up by as much as the sheet is slid past where
 * the row would sit on the foot's edge, and never down -- the sheet's
 * offset and the finger's movement against the row's room (--pin-room,
 * usePinAtFoot), on the sheet's own curve and held still under a finger.
 * So it moves with the sheet in the same frame however busy the page is,
 * where moved by script a frame at a time it fell a frame behind the
 * sheet's slide whenever the page was busy: the figures dipped and came
 * back as a pull down settled (the owner's screen recording, 2026-11-16:
 * "the pill takes a second to settle ... It's jumping"). The way an
 * airport card's tabs are held at its foot (CardTabBar's FloatingBar),
 * the owner's pointer ("how does airport card do it?"). The row is marked
 * data-pin-foot so that nothing stops its ease at the pill
 * (sheet/insets' PILL_BODY).
 */
export const PIN_AT_FOOT =
  "[transform:translateY(min(0px,calc(var(--pin-room,9999px)-var(--sheet-offset,0px)-var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none motion-reduce:transition-none";

/**
 * A row of a sheet's head that is its pill (PIN_AT_FOOT on it): held on
 * the edge of the sheet's foot (`foot`, a selector) while the sheet rests
 * at the pill (`held`), and as the sheet goes down riding with it to there
 * and staying while the rest of the sheet slides on down under it; the
 * other way, waiting there as the sheet comes up until its own place
 * reaches it (the owner, 2026-11-16, of FPL's figures: "calculations
 * should sit at the bottom after sliding and then just stay there while
 * the fpl slides down"). One copy at every size, so nothing is handed over
 * at the pill: every flicker at the end of a pull down came from handing
 * FPL's figures from a second copy at the pill to this one (the owner,
 * 2026-11-16: "Maybe having common code will remove the bugs from fpl?").
 *
 * The script only measures: the row's room, how far the sheet may slide
 * before the row reaches the foot's resting edge, again whenever the
 * page's layout changes (`on` false: none, not this sheet's way now); and
 * whether the row is held (data-pinned, for its own look: in sight at the
 * pill, where the rest of the head is not, and its backing, FplRoute's
 * PINNED), at the pill and, a frame at a time, while a finger has the
 * sheet or it settles.
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, foot: string, { on, held }: { on: boolean; held: boolean }) {
  const dragging = usePanelDragging((d) => d.dragging);
  // The room, measured before the page is drawn, so the row is never seen
  // where it would be unheld.
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    if (!on) {
      row.style.removeProperty("--pin-room");
      return;
    }
    const measure = () => {
      const natural = row.getBoundingClientRect().bottom - moved(row) - moved(row.closest(SHEET));
      row.style.setProperty("--pin-room", `${restingEdge(document.querySelector<HTMLElement>(foot)) - natural}px`);
    };
    measure();
    const resized = new ResizeObserver(measure);
    const page = row.closest("[data-sheet-scroll]");
    if (page) resized.observe(page.firstElementChild ?? page);
    addEventListener("resize", measure);
    return () => {
      resized.disconnect();
      removeEventListener("resize", measure);
    };
  }, [on, foot, ref]);
  // Whether it is held now.
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    if (!on) {
      row.removeAttribute("data-pinned");
      return;
    }
    const check = () => {
      const room = parseFloat(row.style.getPropertyValue("--pin-room")) || 0;
      row.toggleAttribute("data-pinned", held || moved(row.closest(SHEET)) > room);
    };
    let frame = 0;
    const until = dragging ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      check();
      if (performance.now() < until) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [dragging, held, on, ref]);
}

const SHEET = ".group\\/sheet";

/** How far `el` is moved down by its own transform now. */
function moved(el: Element | null) {
  return el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0;
}

/** Where the foot's edge is once the sheet is at rest: its place now with
 *  its own and the sheet's transforms taken off, which cancel at rest (the
 *  foot is moved back by the sheet's offset, sheet/insets' HOLD_AT_EDGE),
 *  so one place at every moment of a drag and a settle. */
function restingEdge(foot: HTMLElement | null) {
  if (!foot) return window.innerHeight;
  return foot.getBoundingClientRect().bottom - moved(foot) - moved(foot.closest(SHEET));
}
