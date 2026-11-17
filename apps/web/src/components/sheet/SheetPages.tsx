import type { ReactNode } from "react";

/** A page's body, kept when the other is up: skipped by its data-hidden
 *  (index.css's tab-page), its layout and its scroll kept for its return,
 *  and inert, out of the way of the keys and VoiceOver, as PanelTabs keeps
 *  the Brief's pages. */
export function SheetPage({ at, up, children }: { at: number; up: boolean; children: ReactNode }) {
  return (
    <div
      data-sheet-page={at}
      data-hidden={up ? undefined : ""}
      inert={!up}
      className="tab-page flex min-h-0 flex-1 flex-col data-hidden:flex-none"
    >
      {children}
    </div>
  );
}
