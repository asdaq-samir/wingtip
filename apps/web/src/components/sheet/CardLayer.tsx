import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CardId, type CardFrame } from "../../lib/sheetCards";
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
 */
export function CardLayer({
  label,
  dismiss,
  opens,
  cardId,
  children,
}: {
  label?: string;
  dismiss?: CardFrame["dismiss"];
  opens?: PanelState;
  cardId?: string;
  children: ReactNode;
}) {
  const fallback = useId();
  const id = cardId ?? fallback;
  const slot = useCardFrame({ label, dismiss, opens }, id);
  return slot ? createPortal(<CardId.Provider value={id}>{children}</CardId.Provider>, slot) : null;
}
