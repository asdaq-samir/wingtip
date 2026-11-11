import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CardId, type CardFrame } from "../../lib/sheetCards";
import { Shown, useShown } from "../../lib/shown";
import type { PanelState } from "../../lib/mapChrome";
import { useCardFrame } from "./useCardFrame";

/**
 * Content shown as a card of its own over the map's sheet -- a place's
 * (PanelCard), the Brief, Settings (ConsoleLayer) -- a nested Drawer
 * (CardStack) with the sheet's sizes, its grabber and its swipe; drawn
 * here, for the caller's providers, and put in the drawer's scroller.
 * Escape is its drawer's: the top card closed (lib/openCards), or the
 * caller's own `dismiss`; a tap on the map leaves it open, the map's own
 * tap deciding. It sizes its own drawer: `opens` as it opens, then
 * useCardSize from its content (or its owner's, by `cardId`).
 *
 * `open`, for a card kept between its openings (the Nav Log, the Profile,
 * the Stops; the owner, 2026-11-11): drawn from its first opening on, its
 * drawer closed while it is not open and its content kept, laid out but
 * not painted (index.css, the kept cards), so opening it again builds
 * nothing -- the Nav Log was 0.6 s to build. Kept is not working: what is
 * inside reads it is out of sight (lib/shown).
 */
export function CardLayer({
  label,
  dismiss,
  opens,
  cardId,
  open,
  children,
}: {
  label?: string;
  dismiss?: CardFrame["dismiss"];
  opens?: PanelState;
  cardId?: string;
  open?: boolean;
  children: ReactNode;
}) {
  const fallback = useId();
  const id = cardId ?? fallback;
  const shown = useShown() && open !== false;
  const slot = useCardFrame({ label, dismiss, opens, open }, id);
  return slot
    ? createPortal(
        <Shown.Provider value={shown}>
          <CardId.Provider value={id}>{children}</CardId.Provider>
        </Shown.Provider>,
        slot,
      )
    : null;
}
