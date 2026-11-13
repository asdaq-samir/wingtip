import { ConsoleLeave } from "../../components/consoleLeave";
import type { ReactNode } from "react";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import CloseButton from "../../components/CloseButton";
import { FloatingCard } from "../../components/FloatingCard";
import SettingsButton from "../../components/SettingsButton";
import { floatLayer, ridingOver, topCard, useOwnFloat, useSheetCards } from "../../lib/sheetCards";
import { Shown } from "../../lib/shown";

/** You among the cards open (lib/sheetCards), for which is on top. */
const YOU = "you-card";

/** A menu's or a select's trigger whose popup is open (Base UI sets both). */
const OPEN_POPUP_TRIGGER = '[aria-expanded="true"]:is([aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"])';

/**
 * You, the avatar's card, as Apple Maps' account card is (the owner's
 * screenshot of iOS 27, 2026-11-13): the floating card every card but an
 * airport's now is (FloatingCard), over the map and everything on it, its
 * buttons too. No title and no grabber: its ✕ in the top corner, and
 * Escape or a tap outside close it too. Kept once drawn, closed, so the
 * next tap shows it at once (keepMounted; its pages go back to its list,
 * lib/shown). Among the cards open (useOwnFloat): a card opened from it
 * (an airplane's form, a logbook entry's) floats over it and hears Escape
 * and a tap outside first, its focus no longer held in You (`modal` only
 * while it is on top); Settings opened from the Map card's gear floats
 * over the Map card.
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
  useOwnFloat(YOU, shown);
  const stack = useSheetCards((s) => s.stack);
  const top = topCard(stack) === YOU;
  // Escape or a tap outside closes it -- not while a card opened from it
  // is over it, nor while a menu or a list just opened from a control in it
  // still has the focus on its trigger, the popup taking the focus a moment
  // after it opens: the key is the menu's (consoles.spec's role menu, run
  // 42867578624).
  const change = (open: boolean, details: DialogPrimitive.Root.ChangeEventDetails) => {
    if (open) return;
    if (!top || details.reason === "focus-out") {
      details.cancel();
      return;
    }
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
      <FloatingCard
        // Put away, kept, while an airport's card opened from it rides the
        // sheet under the floating cards (ridingOver).
        open={shown && !ridingOver(stack, YOU)}
        onOpenChange={change}
        modal={top}
        layer={Math.max(0, floatLayer(stack, YOU))}
        label={label}
        finalFocus={finalFocus}
        // Named for the suite only while it is up: put away it is there,
        // hidden, for the next tap on the avatar.
        testId={shown ? "console-sheet" : undefined}
        // A page open in it (Pilot Details, Settings) heads itself with its
        // own name and close, back to You: the card's own ✕ steps aside, one
        // in sight, not two (the owner's testing, 2026-11-10).
        className="[&:has([data-slot=console-page])>[data-slot=layer-head]]:hidden"
        corners={
          // Its close in the top corner, over what scrolls under it, as
          // Apple's card has it: the shared CloseButton, its 44-point area
          // its own pseudo-element's; Settings' gear in the other corner,
          // the way in to Settings in place of a row (the owner,
          // 2026-11-13: "put settings as icon on top left corner"), as the
          // Map card's gear heads its card.
          <>
            <div data-slot="layer-head" className="absolute top-3 left-3 z-30">
              <SettingsButton testId="settings-row" />
            </div>
            <div data-slot="layer-head" className="absolute top-3 right-3 z-30">
              <CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />
            </div>
          </>
        }
      >
        {/* A page opened straight from the search or a link closes the card
            by its own ✕ (ConsolePages), back to where the pilot came from. */}
        <ConsoleLeave.Provider value={onClose}>{children}</ConsoleLeave.Provider>
      </FloatingCard>
    </Shown.Provider>
  );
}
