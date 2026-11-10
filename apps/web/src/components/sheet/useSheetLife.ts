import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";
import { DRAWER_MS } from "./insets";

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/**
 * Where the sheet is going and what it is laid out for. `snap` is the
 * Drawer's snap point, set at once; `size` the layout, the same going up
 * (the content there as the sheet comes) and, going down, kept till the
 * sheet has landed, so what half showed is not gone before the sheet has
 * moved (the owner, "seems to remove content before sliding down to
 * pill"). A size asked for here (`tell`) is told to the page once landed;
 * the page's own (`pageState`) is gone to and not told back.
 */
export function useSheetLife(pageState: PanelState, tellPage: (state: PanelState) => void) {
  const [snap, setSnap] = useState(pageState);
  const [size, setSize] = useState(pageState);
  const [moving, setMoving] = useState(false);
  const snapRef = useRef(snap);
  const sizeRef = useRef(size);
  const timer = useRef(0);
  const asked = useRef<PanelState | null>(null);

  const go = useCallback(
    (target: PanelState, tell: boolean) => {
      window.clearTimeout(timer.current);
      asked.current = tell ? target : null;
      snapRef.current = target;
      setSnap(target);
      setMoving(true);
      if (RANK[target] >= RANK[sizeRef.current]) {
        sizeRef.current = target;
        startTransition(() => setSize(target));
      }
      timer.current = window.setTimeout(() => {
        sizeRef.current = target;
        setSize(target);
        setMoving(false);
        if (asked.current === target) {
          asked.current = null;
          tellPage(target);
        }
      }, DRAWER_MS + 40);
    },
    [tellPage],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
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

  return { snap, size, moving, ready, go, snapRef, sizeRef };
}
