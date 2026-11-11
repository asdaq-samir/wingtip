import type { PillHead } from "./openCards";
import type { PanelState } from "./mapChrome";
import type { Drawer } from "@base-ui/react/drawer";
import { createContext } from "react";
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
  /** The least it opens at: half for a card, all the way up for a search,
   *  as Maps' does (CardStack); half where none is said. */
  raise?: "half" | "full";
  /** Its own drawer's size, kept while a card is over it (MapPanel). */
  at?: PanelState;
  /** Open, or kept closed under a page put away (lib/shown). */
  shown: boolean;
  frame: CardFrame;
  /** The drawer's scroller, where the content is put. */
  slot: HTMLElement | null;
};

/** The cards open, the last on top. */
export const useSheetCards = create<{ stack: CardEntry[] }>(() => ({ stack: [] }));

/** The top card, the frontmost sheet: null with none open. */
export const topCard = (stack: CardEntry[]): CardEntry | null => [...stack].reverse().find((entry) => entry.shown) ?? null;

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
