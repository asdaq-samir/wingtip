import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "cn";
import type { PanelState } from "../../lib/mapChrome";

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/** The grabber's box: 56 wide and 16 tall, the least room iOS's own grabber
 *  keeps (its bar five points in from the sheet's edge, the first row
 *  under it), at the sheet's free edge: the top of a bottom sheet, the
 *  foot of a top sheet or the side panel (the owner, 2026-11-13: "grabber
 *  and tabs taking minimal space and still meeting their platforms
 *  standard"; it was 24 tall). On a layer of its own (transform-gpu):
 *  iPhone Safari painted a card's frosted head (PinnedHead's backdrop
 *  blur) over it while the card moved, so it came only once the card had
 *  settled (the owner, 2026-11-11: "The grabber shows up after card
 *  settles"). */
const BOX = "absolute inset-x-0 z-30 mx-auto flex h-4 w-14 transform-gpu print:hidden";
const edge = (at: "top" | "bottom") => (at === "top" ? "top-0 items-start pt-1.25" : "bottom-0 items-end pb-1.25");
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/** The sheet's sizes from the grabber: a tap cycles them, small to big and
 *  back; the Up and Down arrows step them, for a keyboard and VoiceOver. */
function useSizes(size: PanelState, ask: (s: PanelState) => void) {
  const [was, setWas] = useState(size);
  const [rising, setRising] = useState(true);
  if (size !== was) {
    setWas(size);
    setRising(RANK[size] > RANK[was]);
  }
  const cycle = () => ask(size === "peek" || size === "full" ? "half" : rising ? "full" : "peek");
  const arrows = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowUp" && size !== "full") ask(size === "peek" ? "half" : "full");
    else if (event.key === "ArrowDown" && size !== "peek") ask(size === "full" ? "half" : "peek");
    else return;
    event.preventDefault();
  };
  return { cycle, arrows };
}

/**
 * iOS's grabber, one 36 by 5 bar. A finger drags the sheet from it (the
 * Drawer's own swipe); tapped it cycles the heights and the arrow keys step
 * them. Its hit area 44 tall off the sheet's edge, over the map, not over
 * the first row: the bar never grows, and what is under it -- the title
 * row's ends, the field all the way up -- is clear of it. The sheet's pages
 * are turned by the round toggle on its top (PageToggle), not this bar.
 */
export function SheetGrabber({
  label,
  size,
  ask,
  at,
}: {
  label: string;
  size: PanelState;
  ask: (s: PanelState) => void;
  at: "top" | "bottom";
}) {
  const { cycle, arrows } = useSizes(size, ask);
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={size !== "peek"}
      aria-keyshortcuts="ArrowUp ArrowDown"
      data-testid="sidebar-trigger-button"
      onClick={cycle}
      onKeyDown={arrows}
      className={cn(
        BOX,
        edge(at),
        RING,
        "justify-center rounded-full",
        // 44 tall from the box's inner edge out past the sheet's.
        "after:absolute after:inset-x-0! after:h-11! after:content-['']",
        at === "top" ? "after:top-auto! after:bottom-0!" : "after:top-0! after:bottom-auto!",
      )}
    >
      <span className="h-[5px] w-9 rounded-full bg-muted-foreground/40" aria-hidden="true" />
    </button>
  );
}
