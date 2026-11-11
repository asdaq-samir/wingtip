import type { PillHead } from "./openCards";
import type { PanelState } from "./mapChrome";
import type { Drawer } from "@base-ui/react/drawer";
import { createContext, useCallback, useContext, useMemo } from "react";
import { create } from "zustand";

/**
 * The cards open over the map's sheet (components/sheet/CardStack), each
 * its own nested Drawer stacked over the sheet as Apple Maps stacks its
 * cards (the owner, 2026-11-11): a control's or the chart's (SheetCard),
 * a place's or a list's (PanelCard), the Brief, Settings. The last opened
 * on top. A card's content stays drawn where its caller is, in React's
 * tree, for its providers, and is put into its drawer's scroller (`slot`).
 */

/** What a card's drawer is told by its content. */
export type CardFrame = {
  /** The test id on the drawer's popup (SheetCard's). */
  testId?: string;
  /** Its name for a screen reader, or the id of the heading that names it. */
  label?: string;
  labelledBy?: string;
  /** Escape, a tap outside, a swipe past the pill, as the Drawer tells
   *  them, the card on top only; none for the frame's own way (CardStack):
   *  Escape a level back, the rest refused. */
  dismiss?: (details: Drawer.Root.ChangeEventDetails) => void;
  initialFocus?: Drawer.Popup.Props["initialFocus"];
  finalFocus?: Drawer.Popup.Props["finalFocus"];
};

export type CardEntry = {
  id: string;
  /** Its name. */
  title?: string;
  /** The least it opens at: half where none is said, all the way up for
   *  a form or Emergency; a page opened in a card opens as high as the card
   *  it covers (the card rule's 2, CardStack). */
  raise?: "half" | "full";
  /** The size it opens at whatever it covers: a card from the search or
   *  the map at half (the card rule's 2), a list all the way up. */
  opens?: PanelState;
  /** Its own drawer's snap point, set as it opens and then by the pilot's
   *  drag or the card itself (useCardSize). */
  at?: PanelState;
  /** Open, or kept closed under a page put away (lib/shown). */
  shown: boolean;
  frame: CardFrame;
  /** The drawer's scroller, where the content is put. */
  slot: HTMLElement | null;
};

/** The cards open, the last on top. */
export const useSheetCards = create<{ stack: CardEntry[] }>(() => ({ stack: [] }));

/** The top card: null with none open. */
export const topCard = (stack: CardEntry[]): CardEntry | null => [...stack].reverse().find((entry) => entry.shown) ?? null;

const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/** The size a card opens at (CardStack): its opener's (`opens`), else as
 *  high as what it covers -- the card under it, else the sheet -- with
 *  `raise` (half) at the least (the card rule's 2). */
export function cardOpening(entry: Pick<CardEntry, "opens" | "raise">, covers: PanelState): PanelState {
  if (entry.opens) return entry.opens;
  const least = entry.raise ?? "half";
  return RANK[covers] > RANK[least] ? covers : least;
}

/** A card's entry changed in place. */
export function setCard(id: string, change: Partial<CardEntry>) {
  useSheetCards.setState((s) => {
    const at = s.stack.findIndex((entry) => entry.id === id);
    const was = s.stack[at];
    if (!was || (Object.keys(change) as (keyof CardEntry)[]).every((k) => Object.is(was[k], change[k]))) return s;
    const stack = [...s.stack];
    stack[at] = { ...was, ...change };
    return { stack };
  });
}

/** The head's place for a card whose content draws its own name there --
 *  a map card's (MapCard), its mark beside its name -- the id that name
 *  takes, which names the card, and what the pill shows of it there. */
export const SheetCardHead = createContext<{
  slot: HTMLElement | null;
  headingId: string;
  setPill: (pill: PillHead | undefined) => void;
} | null>(null);

/** The card a component is drawn in (SheetCard, CardLayer): its id among
 *  the open cards, for useCardSize. */
export const CardId = createContext<string | null>(null);

/** A card's own drawer's size, read and set as Base UI's controlled
 *  `snapPoint` and `onSnapPointChange` are: the snap point of the card it
 *  is called in, or of the card `id` names (a card's own component, which
 *  draws the PanelCard and is outside it). Null outside a card. Only that
 *  card's drawer moves; the sheet under it stays where it is. */
export function useCardSize(id?: string): { size: PanelState; setSize: (size: PanelState) => void } | null {
  const inCard = useContext(CardId);
  const key = id ?? inCard;
  const at = useSheetCards((s) => (key ? s.stack.find((entry) => entry.id === key)?.at : undefined));
  const setSize = useCallback(
    (size: PanelState) => {
      if (key) setCard(key, { at: size });
    },
    [key],
  );
  return useMemo(() => (key ? { size: at ?? "half", setSize } : null), [key, at, setSize]);
}
