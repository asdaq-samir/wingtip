import { ConsoleLeave } from "../../components/consoleLeave";
import type { ReactNode } from "react";
import type { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import SettingsButton from "../../components/SettingsButton";
import { HeadGrid } from "../../components/HeadGrid";
import { PinnedHead } from "../../components/PinnedHead";
import { Shown } from "../../lib/shown";
import { CardLayer } from "../../components/sheet/CardLayer";

/** A menu's or a select's trigger whose popup is open (Base UI sets both). */
const OPEN_POPUP_TRIGGER = '[aria-expanded="true"]:is([aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"])';

/**
 * You, the avatar's card: the stock Drawer's nested drawer over the map's
 * sheet (CardLayer), as every card on the web is but the welcome (the
 * owner, 2026-11-13: "For webapp, why don't we make everything a nested
 * drawer except the welcome one?"), with the sheet's sizes, its grabber
 * and its swipe, half as it opens. Its one head row: Settings' gear at the
 * left (the owner, 2026-11-13: "put settings as icon on top left corner"),
 * the ✕ at the right, and between them nothing, the pilot's name being
 * the large line under it (YouHead), as Apple Maps' account card has it.
 * Kept, closed, while it is put away, so the next tap shows it at once;
 * its drawer's own Escape goes back to the map.
 */
export default function ConsoleLayer({
  label,
  onClose,
  finalFocus,
  shown,
  children,
}: {
  label: string;
  onClose: () => void;
  /** Where the focus goes as it is put away: the button it was opened from. */
  finalFocus: () => HTMLElement | null | false;
  /** Out: put away it is kept, hidden. */
  shown: boolean;
  children: ReactNode;
}) {
  // Its drawer's Escape, the card on top (CardStack): back to the map --
  // not while a menu or a list just opened from a control in it still has
  // the focus on its trigger, the popup taking the focus a moment after it
  // opens: the key is the menu's (consoles.spec's role menu, run
  // 42867578624). The rest the Drawer tells it is refused: a tap on the
  // map leaves it, as it leaves every card.
  const dismiss = (details: Drawer.Root.ChangeEventDetails) => {
    details.cancel();
    if (details.reason !== "escape-key" || details.event.defaultPrevented) return;
    const at = details.event.target;
    if (at instanceof Element && at.closest(OPEN_POPUP_TRIGGER)) return;
    details.event.preventDefault();
    onClose();
  };
  return (
    // Its drawer open while it is up (CardLayer's `open`), and each time it
    // is opened at half, as every card opens: kept by lib/shown alone, it
    // came back at the size it was put away at, the pill, its head alone
    // (the owner's iPhone, 2026-11-14). A swipe down from half closes it,
    // as Apple Maps' account sheet; from all the way up it comes to half
    // (the owner, 2026-11-14).
    <Shown.Provider value={shown}>
      <CardLayer label={label} dismiss={dismiss} onSwipeClose={onClose} finalFocus={finalFocus} open={shown}>
        <section
          aria-label={label}
          // Named for the suite only while it is up: put away it is there,
          // hidden, for the next tap on the avatar.
          data-testid={shown ? "console-sheet" : undefined}
          // A page open in it (Pilot Details, Settings) heads itself with
          // its own name and close, back to You: this row steps aside, one
          // ✕ in sight, not two (the owner's testing, 2026-11-10). Laid out
          // whole in its drawer's scroller (CardStack), its head row sticky
          // at the top over it.
          // Its gear and close float over You's head, at the avatar's own
          // level, with no frosted bar of their own (Apple Maps' account card,
          // the owner's screenshot, 2026-11-14: "Look at this in comparison").
          className={cn(
            // Drawn while its drawer closes too, so it fades out with its
            // content, not an empty card; kept, the drawer is hidden
            // (index.css, the kept cards).
            "flex shrink-0 flex-col print:hidden [&:has([data-slot=console-page])>[data-slot=layer-head]]:hidden",
            "[&>[data-slot=layer-head]]:bg-transparent! [&>[data-slot=layer-head]]:backdrop-blur-none!",
          )}
        >
          {/* Every card's one head row (PinnedHead, HeadGrid), at the
              sheet's corner: its close the shared CloseButton, not
              CardClose, as You is no card a device's Back or the tab bar
              holds (lib/openCards). */}
          <PinnedHead slot="layer-head" flush className="shrink-0">
            <HeadGrid
              start={<SettingsButton testId="settings-row" />}
              middle={null}
              end={<CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />}
            />
          </PinnedHead>
          {/* A page opened straight from the search or a link closes the
              card by its own ✕ (ConsolePages), back to where the pilot
              came from. */}
          <ConsoleLeave.Provider value={onClose}>{children}</ConsoleLeave.Provider>
        </section>
      </CardLayer>
    </Shown.Provider>
  );
}
