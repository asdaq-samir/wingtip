import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCardFrame } from "./useCardFrame";

/**
 * Content shown as a card of its own over the map's sheet -- a place's
 * (PanelCard), the Brief, Settings (ConsoleLayer) -- a nested Drawer
 * (CardStack) with the sheet's sizes, its grabber and its swipe; drawn
 * here, for the caller's providers, and put in the drawer's scroller.
 * Escape goes back a level (the top card's close, use-shortcuts' backOne);
 * a tap on the map leaves it open, the map's own tap deciding.
 */
export function CardLayer({ label, children }: { label?: string; children: ReactNode }) {
  const slot = useCardFrame({ label });
  return slot ? createPortal(children, slot) : null;
}
