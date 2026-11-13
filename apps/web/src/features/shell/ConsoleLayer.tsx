import { ConsoleLeave } from "../../components/consoleLeave";
import type { ReactNode } from "react";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { Dialog, DialogPopup, DialogPortal } from "../../components/ui/dialog";
import { GLASS } from "../../lib/mapChrome";
import { Shown } from "../../lib/shown";

/** A menu's or a select's trigger whose popup is open (Base UI sets both). */
const OPEN_POPUP_TRIGGER = '[aria-expanded="true"]:is([aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"])';

/**
 * You, the avatar's card, as Apple Maps' account card is (the owner's
 * screenshot of iOS 27, 2026-11-13): a card of its own floating over the
 * map and everything on it, its buttons too, ten points in from the
 * sides and the foot -- from `sm` up at the side panel's top corner --
 * its four corners the phone's floating sheet's (radius.sheet), only as
 * tall as what is in it and scrolling inside past the screen's top. No
 * title and no grabber: its ✕ in the top corner, and Escape or a tap
 * outside close it too. The stock Base UI Dialog, where it was a nested
 * Drawer over the map's sheet (CardLayer), which rode the sheet's sizes
 * and left the map's buttons over it. Its material the map's glass
 * (GLASS), solid under Reduce Transparency or Increase Contrast (the
 * utility's own `solid`). Kept once drawn, closed, so the next tap shows
 * it at once (keepMounted; its pages go back to its list, lib/shown).
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
  // Escape or a tap outside closes it -- not while a menu or a list just
  // opened from a control in it still has the focus on its trigger, the
  // popup taking the focus a moment after it opens: the key is the
  // menu's (consoles.spec's role menu, run 42867578624).
  const change = (open: boolean, details: DialogPrimitive.Root.ChangeEventDetails) => {
    if (open) return;
    if (details.reason === "escape-key") {
      const at = details.event.target;
      if (at instanceof Element && at.closest(OPEN_POPUP_TRIGGER)) {
        details.cancel();
        return;
      }
    }
    onClose();
  };
  return (
    <Shown.Provider value={shown}>
      <Dialog open={shown} onOpenChange={change}>
        <DialogPortal keepMounted>
          <DialogPopup
            aria-label={label}
            finalFocus={finalFocus}
            // Named for the suite only while it is up: put away it is
            // there, hidden, for the next tap on the avatar.
            data-testid={shown ? "console-sheet" : undefined}
            className={cn(
              GLASS,
              "fixed inset-x-2.5 bottom-2.5 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-3rem)] flex-col overflow-hidden rounded-(--radius-sheet) text-foreground outline-none print:hidden",
              "sm:top-2.5 sm:right-auto sm:bottom-auto sm:w-96",
              "[animation-duration:var(--motion-page)] data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4",
              // A page open in it (Pilot Details, Settings) heads itself
              // with its own name and close, back to You: the card's own
              // ✕ steps aside, one in sight, not two (the owner's testing,
              // 2026-11-10).
              "[&:has([data-slot=console-page])>[data-slot=layer-head]]:hidden",
            )}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {/* A page opened straight from the search or a link closes
                  the card by its own ✕ (ConsolePages), back to where the
                  pilot came from. */}
              <ConsoleLeave.Provider value={onClose}>{children}</ConsoleLeave.Provider>
            </div>
            {/* Its close in the top corner, over what scrolls under it, as
                Apple's card has it: the shared CloseButton, its 44-point
                area its own pseudo-element's. */}
            <div data-slot="layer-head" className="absolute top-3 right-3 z-30">
              <CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </Shown.Provider>
  );
}
