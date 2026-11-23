import { useLayoutEffect, useRef, type RefObject } from "react";
import type { PanelState } from "../../../lib/mapChrome";
import { panelNow } from "../../plan";

/**
 * The route's field (RouteEditor, the box's other face) raises the phone's
 * sheet all the way up when it does not fit above FPL's foot bar: at half,
 * a long route's lines wrapped down behind the bar, its Add Stops pill
 * and the toggle back with them, and the pilot could not reach the toggle
 * to turn the box back (the owner's iPhone, 2026-11-23). The one place the
 * app takes the sheet to full by itself (panelNow's riseToSee rule), as
 * the owner asked there: through the page's size, the Drawer's own snap
 * point, as Show All Stops does. Once a time the field is open, so a
 * pilot who lowers it again is left there, and never per keystroke; the
 * field folded leaves the sheet where it is. Only in the box's own place
 * (inPlace); under a card the card has the screen. All the way up the page's
 * end room, the bar's height (SheetScroller), keeps its last row clear.
 */
export function useFieldRise(field: RefObject<HTMLElement | null>, on: boolean, setPanel: (next: PanelState) => void) {
  const raised = useRef(false);
  useLayoutEffect(() => {
    const el = field.current;
    if (!on || !el || typeof ResizeObserver === "undefined") return;
    const check = () => {
      if (raised.current || panelNow.current === "full") return;
      // Only under a phone's foot bar (sheet/FootBar), laid out at the
      // viewport's foot even while the keyboard hides it.
      const bar = document.querySelector<HTMLElement>('[data-testid="foot-bar"]');
      if (!bar) return;
      if (Math.round(el.getBoundingClientRect().bottom) <= Math.round(bar.getBoundingClientRect().top)) return;
      raised.current = true;
      setPanel("full");
    };
    // As it opens, and as its lines grow.
    const watch = new ResizeObserver(check);
    watch.observe(el);
    return () => watch.disconnect();
  }, [field, on, setPanel]);
}
