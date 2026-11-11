import { useEffect, useRef, type RefObject } from "react";

/**
 * Going back returns to where you were, opening something new starts at
 * the top (the one scrolling rule, the owner 2026-11-10): as something is
 * opened in place of a list (`away`), the list's scroller (the nearest one
 * round `anchor`) is kept where it was and put at its top; as it closes,
 * the list's place is put back.
 */
export function useScrollPlace(anchor: RefObject<HTMLElement | null>, away: boolean) {
  const kept = useRef<number | null>(null);
  useEffect(() => {
    const scroller = anchor.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    if (away) {
      kept.current ??= scroller.scrollTop;
      scroller.scrollTo({ top: 0 });
    } else if (kept.current !== null) {
      scroller.scrollTop = kept.current;
      kept.current = null;
    }
  }, [anchor, away]);
}
