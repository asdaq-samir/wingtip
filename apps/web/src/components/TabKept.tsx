import { Suspense, useRef, type ReactNode } from "react";
import { cn } from "cn";
import { Shown, useShown } from "../lib/shown";
import { useKeptScroll } from "../lib/scrollPlace";

/**
 * A tab's body kept under the others once it has been opened, as iOS keeps
 * a tab's screen: back to it, it is as it was left -- a list scrolled where
 * it was, a card open over it -- and not built again. Out of sight it is
 * inert and not laid out (index.css's tab-away), its layout kept for its
 * return, as PanelTabs keeps the Brief's pages; not under React's
 * Activity, whose effects stopped and started again on every return.
 * Measured again on React 19.3 (2026-11-09, a production build at CPU 4x,
 * FPL, Airport and Airplane tapped in turn, 36 taps each way): tap to
 * frame 14.6-14.8 ms either way on tabs with no route, no long task in
 * either; Activity's hidden mode is display: none, which with a route
 * lays the Nav Log out again on each return (0.6 s, PanelTabs) and stops
 * and starts its effects (0.5 s), so this stays. A part of it on a
 * chunk not yet in hand (the Aircraft tab's, aircraftTabChunk) waits
 * here, the tab empty a moment, not the panel round it.
 *
 * Its place in the sheet's one scroller is kept too (useKeptScroll): back
 * to it, the list is where it was left.
 *
 * Kept is not working: what is inside reads whether it is in sight
 * (lib/shown) and stops its polling, clocks and store reads while it is
 * not.
 */
export default function TabKept({
  away,
  still = false,
  children,
}: {
  away: boolean;
  /** In place but at rest: Setup up over the tabs (MapPanel), which hides
   *  them plainly; Setup's own layer says it is shown (MapPage). */
  still?: boolean;
  children: ReactNode;
}) {
  const shown = useShown() && !away && !still;
  const node = useRef<HTMLDivElement>(null);
  useKeptScroll(node, !away);
  return (
    <div ref={node} inert={away} className={cn("flex min-h-0 flex-col", away ? "tab-away flex-none" : "flex-1")}>
      <Shown.Provider value={shown}>
        <Suspense fallback={null}>{children}</Suspense>
      </Shown.Provider>
    </div>
  );
}
