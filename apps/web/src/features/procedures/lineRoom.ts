import { createContext, useCallback, useRef, useState } from "react";
import { countFitting } from "../../components/useFiguresFit";

/** Whether a Land or Takeoff line has room for "RWY" before its runway
 *  (PhaseSection measures, RunwayPill reads). Elsewhere, none. */
export const LineRoom = createContext(false);

/**
 * A phase's pills' row measured as it is laid out: room for "RWY" while the
 * pills, the word with them, fit its one line, measured, not counted (the
 * owner's iPhone, 2026-11-26: "Is there space here for RWY"). The word's
 * width is read while it shows and kept, so the line takes it back once
 * there is room again, and never flips: it is let back only where the
 * pills and it fit. The row's own words, not a guess: the pilot's text
 * size and the phone's width are in it.
 */
export function useLineRoom(): [boolean, (row: HTMLElement | null) => (() => void) | undefined] {
  const [roomy, setRoomy] = useState(true);
  const word = useRef(0);
  const measure = useCallback((row: HTMLElement | null) => {
    if (!row) return undefined;
    const fit = () => {
      // Held while one of the line's menus is open: the page round an open
      // menu is laid out a point or two otherwise, and a line on the edge
      // of room lost its "RWY" as its runway's menu opened (the owner's
      // iPhone, 2026-11-26). Nothing on the line moves while it is being
      // picked from.
      if (row.querySelector("[data-popup-open]")) return;
      const widths = ([...row.children] as HTMLElement[]).map((item) => item.getBoundingClientRect().width);
      if (!widths.length) return;
      const shown = row.querySelector<HTMLElement>("[data-rwy]");
      // The word and the 2 between it and the runway (the pill's gap-0.5).
      if (shown) word.current = shown.getBoundingClientRect().width + 2;
      else widths[0]! += word.current;
      setRoomy(countFitting(row, widths) === widths.length);
    };
    const watch = new ResizeObserver(fit);
    // Watching the row and each pill; a watch's first answer comes once
    // they are laid out, so nothing here forces a layout of its own.
    const follow = () => {
      watch.disconnect();
      watch.observe(row);
      for (const item of row.children) watch.observe(item);
    };
    // A pill come or gone (a kind picked, the hold), each watched anew.
    const pills = new MutationObserver(follow);
    pills.observe(row, { childList: true });
    // And as a menu of the line opens or closes, on the next frame, once
    // laid out: held while it is open, the line is measured again as it
    // closes, a resize skipped meanwhile (an iPad turned) taken then.
    let frame = 0;
    const menus = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    menus.observe(row, { subtree: true, attributes: true, attributeFilter: ["data-popup-open"] });
    follow();
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      pills.disconnect();
      menus.disconnect();
    };
  }, []);
  return [roomy, measure];
}
