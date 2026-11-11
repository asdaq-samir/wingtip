import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import type { PanelState } from "../../lib/mapChrome";

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/**
 * The sheet raised for a card in it (lib/sheetCards' raisedFor): a card
 * opened comes up half way at the least, all the way for a search or a
 * card opened full (an airplane's profile, Emergency); the last put away,
 * the sheet goes back to where it was. By where it is going (`snap`), not
 * its layout, kept at half on its way down: a card reopened then landed at
 * the pill, out of sight.
 *
 * As a card opens or goes only, not again as `ask` changes: it changes
 * with the page's panel and its address a size later, and run then it
 * took a card opened all the way up back up the moment the pilot lowered
 * it -- an airplane's profile could not be brought to half or dragged down
 * (card-scroll.spec, the one scrolling rule).
 */
export function useCardRaise(raised: PanelState | null, ask: (size: PanelState) => void, snap: RefObject<PanelState>) {
  const raisedFrom = useRef<PanelState | null>(null);
  const raiseFor = useEffectEvent((raised: PanelState | null) => {
    const now = snap.current;
    if (raised) {
      raisedFrom.current ??= now;
      if (RANK[now] < RANK[raised]) ask(raised);
    } else if (raisedFrom.current !== null) {
      const back = raisedFrom.current;
      raisedFrom.current = null;
      if (back !== now) ask(back);
    }
  });
  useEffect(() => raiseFor(raised), [raised]);
}
