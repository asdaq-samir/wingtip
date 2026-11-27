import { useCallback, useContext } from "react";
import { create } from "zustand";
import { CardId } from "../../lib/sheetCards";

/** Each card's foot slot on a phone's bottom sheet (sheet/CardFoot), by the
 *  card's id: its element, whether it is in sight, and its height, px,
 *  as last measured in sight. */
type Foot = { el: HTMLElement; shown: boolean; height: number };

/** Where the cards' foot slots go (SheetDrawer's, in its viewport beside
 *  the popup), and each card's slot. */
export const useCardFeet = create<{ host: HTMLElement | null; feet: Record<string, Foot> }>(() => ({ host: null, feet: {} }));

/** Card `id`'s slot told, or taken away (null). */
export function putCardFoot(id: string, foot: Foot | null) {
  useCardFeet.setState((s) => {
    const rest = Object.fromEntries(Object.entries(s.feet).filter(([key]) => key !== id));
    return { feet: foot ? { ...rest, [id]: foot } : rest };
  });
}

/** The ref of the box the slots are put in (SheetDrawer's, a phone's bottom sheet). */
export function cardFeetHost(node: HTMLElement | null) {
  useCardFeet.setState({ host: node });
}

/** A foot slot's mark, which the card's own drawer does not count as a
 *  tap outside it (CardStack's onOpenChange). */
export const CARD_FOOT = "data-card-foot";

/** Whether `target` is in a card's foot slot. */
export function inCardFoot(target: EventTarget | null | undefined): boolean {
  return target instanceof Element && !!target.closest(`[${CARD_FOOT}]`);
}

/** The foot slot of the card this is drawn in, on a phone's bottom sheet:
 *  `undefined` with none (the side panel, a top sheet: the bar stays in the
 *  card), null while it is out of sight, else its element. */
export function useCardFootSlot(): HTMLElement | null | undefined {
  const id = useContext(CardId);
  return useCardFeet((s) => {
    const foot = id ? s.feet[id] : undefined;
    return foot && (foot.shown ? foot.el : null);
  });
}

/** Card `id`'s foot slot's height, px, as last measured in sight (kept
 *  while it is out of sight); 0 before it ever was: the
 *  card's end room and scroll padding under its tab bar (SheetCard,
 *  sheet/cardScrollRoom), as useFootBarHeight is FPL's page's. */
export function useCardFootHeight(id: string | null | undefined): number {
  return useCardFeet(useCallback((s) => (id ? (s.feet[id]?.height ?? 0) : 0), [id]));
}
