import { useEffect, useRef, useState, type ReactNode, useEffectEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Spinner } from "./ui/spinner";
import { SIZE } from "../lib/tokens";

/**
 * A live card that refreshes on a pull from its top, as iOS's refresh
 * control does (the Brief, an airport's card, traffic): pulled down
 * size.refresh-pull points with everything in it scrolled to its start,
 * and let go, it asks again (`onRefresh`), a spinner at its top until the
 * answer is in. It lays out nothing of its own (display: contents), only
 * the gap the pull opens. On a phone's sheet a pull at a list's start is
 * also the stock Drawer's to take the sheet down by, as an iOS sheet's
 * scrolled-to-the-top list hands its drag to the sheet.
 */
export default function PullToRefresh({
  onRefresh,
  children,
  testId,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refresh = useEffectEvent(onRefresh);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let from: number | null = null;
    let pulled = 0;
    const atTop = (target: EventTarget | null) => {
      for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
        if (node.scrollTop > 0) return false;
      }
      return true;
    };
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      from = touch && event.touches.length === 1 && !busyRef.current && atTop(event.target) ? touch.clientY : null;
      pulled = 0;
    };
    // On the window, so after the sheet's own listener has had the move:
    // one it took (defaultPrevented) is the sheet's drag, not a pull.
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (from === null || !touch) return;
      if (event.defaultPrevented || event.touches.length !== 1) {
        from = null;
        setPull(0);
        return;
      }
      // Half the finger's way, as a rubber band gives, to a little past the mark.
      pulled = Math.max(0, Math.min((touch.clientY - from) / 2, SIZE.refreshPull * 1.25));
      setPull(pulled);
    };
    const end = () => {
      if (from === null) return;
      from = null;
      const go = pulled >= SIZE.refreshPull / 2;
      pulled = 0;
      setPull(0);
      if (!go) return;
      busyRef.current = true;
      setBusy(true);
      void refresh().finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
    };
    el.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  const ready = pull >= SIZE.refreshPull / 2;
  return (
    <div ref={ref} className="contents" data-testid={testId} aria-busy={busy || undefined}>
      {(pull > 0 || busy) && (
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden text-muted-foreground"
          style={{ height: busy ? 40 : pull }}
        >
          {busy ? (
            <Spinner aria-label="Refreshing" />
          ) : (
            <RefreshCw
              className="size-5"
              style={{ opacity: Math.min(1, pull / (SIZE.refreshPull / 2)), transform: `rotate(${pull * 4}deg)` }}
              aria-hidden
              data-ready={ready || undefined}
            />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
