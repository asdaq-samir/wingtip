import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";

/**
 * A card's content, kept from telling the map's sheet about the dialogs
 * opened in it: a picture full screen, an alert, a phone sheet.
 *
 * A card's content is drawn where its caller is in React's tree (useCardFrame,
 * for the caller's providers) and put in its drawer's scroller, so a Base UI
 * dialog in it finds the sheet's Drawer as its parent, not the card's. Base
 * UI tells a parent how many are open over it by setting the count, not
 * adding to it (useDialogRoot's onNestedDialogOpen, @base-ui/react 1.9.0):
 * a dialog opened from a card and closed again set the sheet's to none
 * while the cards were still up over it. The sheet then lost
 * data-nested-drawer-open, and its ground, its shadow and its swipe came
 * back under the card: lowered to the pill, the card stood under a plain
 * grey slab, the sheet at half with its content put away for the card (the
 * owner's iPhone, 2026-11-20, C81's card after its diagram; card-pill-map
 * spec). The sheet hears only CardStack's own Drawer, which counts the
 * cards.
 *
 * Here they find a Root of their own that never opens, which Base UI's own
 * check passes by (a closed root takes no count and tells its parent
 * nothing), so they are no one's nested dialogs, as a dialog opened
 * anywhere else on the page is not. Each is still modal with its own
 * focus trap, backdrop and Escape.
 */
export function CardDialogs({ children }: { children: ReactNode }) {
  return <Dialog.Root open={false}>{children}</Dialog.Root>;
}
