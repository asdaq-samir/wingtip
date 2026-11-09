import { Suspense, type ReactNode } from "react";
import { cn } from "cn";

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
 */
export default function TabKept({ away, children }: { away: boolean; children: ReactNode }) {
  return (
    <div inert={away} className={cn("flex min-h-0 flex-col", away ? "tab-away flex-none" : "flex-1")}>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
