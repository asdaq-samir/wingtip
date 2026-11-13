import { closeTopCard } from "../../lib/openCards";
import type { CardCloseDetails, CardFrame } from "../../lib/sheetCards";

/**
 * A card's answer to Base UI's word to close it, riding (CardStack's
 * Drawer) or floating (FloatingCards' Dialog) alike. The card on top alone
 * hears it, as Base UI gives Escape to the topmost of nested drawers; the
 * focus going elsewhere -- the sheet, the map -- leaves it open: it is no
 * modal. A riding card's swipe past the pill is no close: it stays at the
 * pill with its title row (the card rule's 10, `toPill`). Then its content's
 * own way (`frame.dismiss`); else Escape closes the top card, a level back,
 * as a device's Back does (lib/openCards), unless something took the key
 * first (a desktop's shortcuts); taken, so the Back's Escape
 * (lib/backNavigation) goes no further. Anything else is refused.
 */
export function answerClose(frame: CardFrame, top: boolean, details: CardCloseDetails, toPill?: () => void) {
  if (!top || details.reason === "focus-out") return details.cancel();
  if (details.reason === "swipe") {
    details.cancel();
    toPill?.();
    return;
  }
  if (frame.dismiss) return frame.dismiss(details);
  details.cancel();
  if (details.reason !== "escape-key" || details.event.defaultPrevented) return;
  if (closeTopCard()) details.event.preventDefault();
}
