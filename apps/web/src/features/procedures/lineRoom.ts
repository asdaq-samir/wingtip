import { createContext, useCallback, useRef, useState } from "react";

/** Whether a Land or Takeoff line has room for "RWY" before its runway
 *  (PhaseSection measures, RunwayPill reads). Elsewhere, none. */
export const LineRoom = createContext(false);

/**
 * A phase's pills' row measured as it is laid out: room for "RWY" while the
 * pills, the word with them, fit its one line, measured, not counted (the
 * owner's iPhone, 2026-11-26: "Is there space here for RWY", KPWK's Land
 * with ARR and APCH and room to spare, where one chip beside the runway at
 * most said there was). The word's width is read while it shows and kept,
 * so the line takes it back once there is room again, and never flips:
 * it is let back only where the pills and it fit. The row's own words, not
 * a guess: the pilot's text size and the phone's width are in it.
 */
export function useLineRoom(): [boolean, (row: HTMLElement | null) => (() => void) | undefined] {
  const [roomy, setRoomy] = useState(true);
  const word = useRef(0);
  const measure = useCallback((row: HTMLElement | null) => {
    if (!row) return undefined;
    const fit = () => {
      // Held while one of the line's menus is open: the page round an open
      // menu is laid out a point or two otherwise (its scroll held), and a
      // line on the edge of room lost its "RWY" as its runway's menu
      // opened (the owner's iPhone, 2026-11-26: "Rwy disappears when
      // opening menu"). Nothing on the line moves while it is being picked from.
      if (row.querySelector("[data-popup-open]")) return;
      const items = [...row.children] as HTMLElement[];
      if (!items.length) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const used = items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0) + gap * (items.length - 1);
      const shown = row.querySelector<HTMLElement>("[data-rwy]");
      // The word and the 2 between it and the runway (the pill's gap-0.5).
      if (shown) word.current = shown.getBoundingClientRect().width + 2;
      const room = row.clientWidth;
      setRoomy(shown ? used <= room + 0.5 : used + word.current <= room);
    };
    const watch = new ResizeObserver(fit);
    const follow = () => {
      watch.disconnect();
      watch.observe(row);
      for (const item of row.children) watch.observe(item);
    };
    // A pill come or gone (a kind picked, the hold), each watched anew.
    const pills = new MutationObserver(() => {
      follow();
      fit();
    });
    pills.observe(row, { childList: true });
    follow();
    fit();
    return () => {
      watch.disconnect();
      pills.disconnect();
    };
  }, []);
  return [roomy, measure];
}
