import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/**
 * Where the sheet is going and what it is laid out for. `snap` is the
 * Drawer's snap point, set at once; `size` the layout, the same going up
 * (the content there as the sheet comes) and, going down, kept till the
 * sheet has landed, so what half showed is not gone before the sheet has
 * moved (the owner, "seems to remove content before sliding down to
 * pill"). Landed is the Drawer's own word: its popup's slide ended
 * (`landed`, from the popup's transitionend), or at once where nothing
 * slides (`still`: the side panel, Reduce Motion, the same height). A size
 * asked for here (`tell`) is told to the page once landed; the page's own
 * (`pageState`) is gone to and not told back.
 */
export function useSheetLife(
  pageState: PanelState,
  tellPage: (state: PanelState) => void,
  still: (target: PanelState) => boolean = () => false,
) {
  const [snap, setSnap] = useState(pageState);
  const [size, setSize] = useState(pageState);
  const [moving, setMoving] = useState(false);
  const snapRef = useRef(snap);
  const sizeRef = useRef(size);
  const asked = useRef<PanelState | null>(null);
  const stillRef = useRef(still);
  useEffect(() => {
    stillRef.current = still;
  });

  const landed = useCallback(() => {
    const target = snapRef.current;
    sizeRef.current = target;
    setSize(target);
    setMoving(false);
    if (asked.current === target) {
      asked.current = null;
      tellPage(target);
    }
  }, [tellPage]);

  const go = useCallback(
    (target: PanelState, tell: boolean) => {
      const at = snapRef.current;
      asked.current = tell ? target : null;
      snapRef.current = target;
      setSnap(target);
      if (target === at || stillRef.current(target)) {
        landed();
        return;
      }
      setMoving(true);
      if (RANK[target] >= RANK[sizeRef.current]) {
        sizeRef.current = target;
        startTransition(() => setSize(target));
      }
    },
    [landed],
  );
  useEffect(() => {
    if (pageState !== snapRef.current) go(pageState, false);
  }, [pageState, go]);

  // No easing until the sheet has been drawn where it rests: the Drawer
  // measures after its first frame, and slid from its full height to the
  // pill as the page opened.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return { snap, size, moving, ready, go, landed, snapRef, sizeRef };
}
