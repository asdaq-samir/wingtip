import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Every card's and page's head in the sheet: ONE row -- its name, and its
 * Share, star and ✕ -- pinned at the sheet's top under the grabber from
 * the start, the content scrolling on under it seen blurred through its
 * frost (frost-head, index.css), at the owner's rule (2026-11-10: "just
 * keep the title on top and content moves under with a frosty style").
 * It replaced a large title that folded into a compact bar as the card
 * scrolled.
 *
 * Sticky in the card's scroller (under-head), which runs up under the
 * sheet's head band by its height (--head-room) and has its own room
 * over its first line (--under-pad): stuck at the band's foot, its own
 * padding over that room, and it starts where it sticks (the same
 * pulled-up margin). Its
 * height is left on the scroller as --pinned-head, for what pins under it
 * (an airport card's tabs). For the browser tests it is card-head-pinned;
 * its row is the caller's `testId`.
 */
export function PinnedHead({ children, testId, className }: { children: ReactNode; testId?: string; className?: string }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = node.current;
    const scroller = head?.closest<HTMLElement>(".overflow-y-auto");
    if (!head || !scroller) return;
    const watch = new ResizeObserver(() => scroller.style.setProperty("--pinned-head", `${head.offsetHeight}px`));
    watch.observe(head);
    return () => {
      watch.disconnect();
      scroller.style.removeProperty("--pinned-head");
    };
  }, []);
  return (
    <div
      ref={node}
      className="frost-head sticky top-[calc(var(--head-room,0px)-var(--under-pad,0px))] z-20 -mx-4 -mt-[var(--under-pad,0px)] px-4 pt-[calc(var(--under-pad,0px)+0.375rem)] pb-1.5 print:static"
      data-testid="card-head-pinned"
    >
      <div className={cn("flex items-center gap-2", className)} data-testid={testId}>
        {children}
      </div>
    </div>
  );
}
