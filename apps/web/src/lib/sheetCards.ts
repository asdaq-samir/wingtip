import type { PillHead } from "./openCards";
import type { PanelState } from "./mapChrome";
import type { Drawer } from "@base-ui/react/drawer";
import { createContext, useCallback, useContext, useMemo } from "react";
import { create } from "zustand";

/**
 * The cards open over the map's sheet (components/sheet/CardStack), each
 * its own nested Drawer stacked over the sheet as Apple Maps stacks its
 * cards (the owner, 2026-11-11): a control's or the chart's (SheetCard),
 * a place's or a list's (SheetCard too), the Brief, Settings. The last opened
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

export type CardState = "open" | "kept" | "leaving";

export type CardEntry = {
  id: string;
  /** Its name. */
  title?: string;
  /** Emergency, the one card that opens all the way up (the card rule's 4). */
  fullScreen?: boolean;
  /** Its own drawer's snap point, set as it opens and then by the pilot's
   *  drag or the card itself (useCardSize). */
  at?: PanelState;
  /** Open; kept closed under a page put away (lib/shown) or between its
   *  openings; or leaving, its caller gone: its drawer closes by Base UI's
   *  own close (its focus handed back, its parent told), then the entry
   *  goes (CardStack). */
  state: CardState;
  frame: CardFrame;
  /** The drawer's scroller, where the content is put. */
  slot: HTMLElement | null;
};

/** The cards open, the last on top. */
export const useSheetCards = create<{ stack: CardEntry[] }>(() => ({ stack: [] }));

const REACH: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/**
 * The card that covers the map most: of those open, the one at the
 * highest size, the last opened of those as high. A card on top can sit
 * lower than the one under it -- a NOTAM's card at half over its airport's
 * all the way up -- and the map shows only above the higher of the two, so
 * the map's buttons, its room and the rules over it follow that one (the
 * owner's iPhone, 2026-11-12: the buttons drawn over the airport card's
 * NOTAM rows, at the lower card's top). `among` narrows it (the cards up).
 */
export function coverCard(stack: CardEntry[], among: (entry: CardEntry) => boolean = () => true): CardEntry | null {
  let cover: CardEntry | null = null;
  for (const entry of stack) {
    if (entry.state !== "open" || !among(entry)) continue;
    if (!cover || REACH[entry.at ?? cardOpening(entry)] >= REACH[cover.at ?? cardOpening(cover)]) cover = entry;
  }
  return cover;
}

/** The size a card opens at (CardStack): half, every card, whatever it
 *  covers and wherever it is opened from, then where the pilot drags it,
 *  as Apple Maps opens its cards at the medium detent (the owner,
 *  2026-11-11: "I thought stock was to open each card medium by
 *  default"); Emergency alone all the way up (the card rule's 4). */
export function cardOpening(entry: Pick<CardEntry, "fullScreen">): PanelState {
  return entry.fullScreen ? "full" : "half";
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

/** A card's entry taken away, once its drawer has closed (CardStack). */
export function dropCard(id: string) {
  useSheetCards.setState((s) => ({ stack: s.stack.filter((entry) => entry.id !== id || entry.state !== "leaving") }));
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
 *  draws the SheetCard and is outside it). Null outside a card. Only that
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
