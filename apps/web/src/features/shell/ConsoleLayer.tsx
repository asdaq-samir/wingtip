import { ConsoleLeave } from "../../components/consoleLeave";
import type { ReactNode } from "react";
import type { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { CardHeadRow } from "../../components/CardHead";
import { Shown } from "../../lib/shown";
import { CardLayer } from "../../components/sheet/CardLayer";

/** A menu's or a select's trigger whose popup is open (Base UI sets both). */
const OPEN_POPUP_TRIGGER = '[aria-expanded="true"]:is([aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"])';

/**
 * Setup's page in the map's panel, a tab's body as the others' are: named
 * for the console it is (a region, no longer a dialog: the focus stays on
 * the tab picked, as it does for the others), hidden while another tab is
 * up. A card of its own over the sheet, the stock Drawer's nested drawer
 * (CardLayer; the owner, 2026-11-11), kept, closed, while it is put away;
 * its drawer's own Escape goes back to the tab before it.
 */
export default function ConsoleLayer({
  label,
  detent,
  edge,
  onClose,
  shown,
  children,
}: {
  label: string;
  detent: "medium" | "large";
  edge: "top" | "bottom";
  onClose: () => void;
  /** Setup the tab up: put away it is kept, hidden. */
  shown: boolean;
  children: ReactNode;
}) {
  // Its drawer's Escape, the card on top (CardStack): back to the map --
  // not while a menu or a list just opened from a control in it still has
  // the focus on its trigger, the popup taking the focus a moment after it
  // opens: the key is the menu's (consoles.spec's role menu, run
  // 42867578624). The rest the Drawer tells it is refused: it is no modal.
  const dismiss = (details: Drawer.Root.ChangeEventDetails) => {
    details.cancel();
    if (details.reason !== "escape-key" || details.event.defaultPrevented) return;
    const at = details.event.target;
    if (at instanceof Element && at.closest(OPEN_POPUP_TRIGGER)) return;
    details.event.preventDefault();
    onClose();
  };
  return (
    // Its drawer open while it is up (CardLayer reads lib/shown): the
    // sheet's body round it is at rest under Setup (MapPanel's `still`).
    <Shown.Provider value={shown}>
      {/* At half as it opens, as every card does, from the account button or a link. */}
      <CardLayer dismiss={dismiss}>
        <section
          aria-label={label}
          // Named for the suite only while it is up: put away it is there,
          // hidden, for the next tap on Setup.
          data-testid={shown ? "console-sheet" : undefined}
          data-detent={detent}
          data-edge={edge}
          // A page open in it (Minimums, Airplanes) heads itself with its own
          // name and close, back to Settings: this row steps aside, one ✕ in
          // sight, not two (the owner's testing, 2026-11-10).
          // Laid out whole in its drawer's scroller (CardStack), its title row
          // sticky at the top over it.
          className={cn(
            "shrink-0 flex-col print:hidden [&:has([data-slot=console-page])>[data-slot=layer-head]]:hidden",
            shown ? "flex" : "hidden",
          )}
        >
          {/* Its name and its close, the way back to the sheet under it, at the
          sheet's top: the page covers the title row and the search, as every
          page does by the one card rule (the owner, 2026-11-10). Every card's
          one head row (CardHeadRow: its name at a card's 22 points, pinned and
          frosted, at the sheet's smallest size all of it in sight), where it
          drew its own at a drawer's 17 under its pages' 22 (the owner,
          2026-11-11: "Why is the title smaller, isn't it shared code?"). Its
          close the shared CloseButton, not CardClose: Settings is no card a
          device's Back or the tab bar holds (lib/openCards). */}
          <CardHeadRow
            name="Settings"
            slot="layer-head"
            flush
            end={<CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />}
          />
          {/* A page opened straight from the search closes the console by
          its own ✕ (ConsolePages), back to where the pilot came from. */}
          <ConsoleLeave.Provider value={onClose}>{children}</ConsoleLeave.Provider>
        </section>
      </CardLayer>
    </Shown.Provider>
  );
}
