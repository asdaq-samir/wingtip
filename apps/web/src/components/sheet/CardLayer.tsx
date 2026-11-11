import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CardFrame } from "../../lib/sheetCards";
import { useCardFrame } from "./useCardFrame";

/**
 * Content shown as a card of its own over the map's sheet -- a place's
 * (PanelCard), the Brief, Settings (ConsoleLayer) -- a nested Drawer
 * (CardStack) with the sheet's sizes, its grabber and its swipe; drawn
 * here, for the caller's providers, and put in the drawer's scroller.
 * Escape is its drawer's: the top card closed (lib/openCards), or the
 * caller's own `dismiss`; a tap on the map leaves it open, the map's own
 * tap deciding.
 */
export function CardLayer({ label, dismiss, children }: { label?: string; dismiss?: CardFrame["dismiss"]; children: ReactNode }) {
  const slot = useCardFrame({ label, dismiss });
  return slot ? createPortal(children, slot) : null;
}
