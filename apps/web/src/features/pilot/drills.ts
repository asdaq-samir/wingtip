/**
 * Flash-card drills (the roadmap's light-gun and 91.155 drills): what a
 * student is asked on the oral and has to know cold, as cards to go
 * through until it is -- the tower's light signals (14 CFR 91.125) and
 * the basic VFR weather minimums (91.155), each worded as the regulation
 * words it, by the engine (`drill_decks`).
 *
 * Spaced repetition by Leitner's boxes: a card known moves up a box and
 * comes back later (the same session, then a day, three, a week, a
 * fortnight); a card missed goes back to the first box and comes round
 * again before the session ends. Kept in this browser: a student's own
 * progress, nobody else's to read.
 */
import { callEngine } from "../../lib/engine/engine";
import { keptStore } from "../../lib/storage";

export type Light = "green" | "red" | "white";

export interface Card {
  id: string;
  prompt: string;
  answer: string;
  /** What else the regulation says about it, where it says more. */
  detail?: string;
  /** The light shown, for the light-gun cards: its colours in turn, and
   *  whether it flashes. */
  light?: { colors: Light[]; flashing: boolean };
}

export interface Deck {
  key: DeckKey;
  title: string;
  /** Where the words come from, and where to read them. */
  source: string;
  url: string;
  cards: Card[];
}

export type DeckKey = "light-gun" | "vfr-minimums";

/** The two decks, the engine's (`drill_decks`): 91.125's table and
 *  91.155(a)'s, worded there once from the rules the airspace column
 *  uses. Asked once, when a drill first opens (the engine is loaded by
 *  then). */
let decks: Record<DeckKey, Deck> | null = null;

export function deckOf(key: DeckKey): Deck {
  decks ??= Object.fromEntries(callEngine("drill_decks", {}).map(d => [d.key, {
    ...d,
    cards: d.cards.map(c => ({
      id: c.id, prompt: c.prompt, answer: c.answer, detail: c.detail ?? undefined,
      light: c.colours.length ? { colors: c.colours, flashing: c.flashing } : undefined,
    })),
  }])) as Record<DeckKey, Deck>;
  return decks[key];
}

/** Days until a card in each box comes round again: the first box the
 *  same session. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16] as const;
const DAY = 86_400_000;

/** Where each card of a deck stands: its box (1 to 5) and when it is due. */
export type Progress = Record<string, { box: number; due: number }>;

/** A card answered: known, up a box and away for its interval; missed,
 *  back to the first box and due now. */
export function answered(progress: Progress, cardId: string, knew: boolean, now: number): Progress {
  const box = knew ? Math.min(INTERVAL_DAYS.length, (progress[cardId]?.box ?? 1) + 1) : 1;
  return { ...progress, [cardId]: { box, due: now + INTERVAL_DAYS[box - 1]! * DAY } };
}

/** The deck's cards due now -- never seen, or past their day -- the
 *  lowest box first, in the deck's order within a box. */
export function dueCards(deck: Deck, progress: Progress, now: number): Card[] {
  const at = (c: Card) => progress[c.id] ?? { box: 0, due: 0 };
  return deck.cards.filter(c => at(c).due <= now).sort((a, b) => at(a).box - at(b).box);
}

/** When the next card comes due, or null where none is waiting. */
export function nextDue(deck: Deck, progress: Progress, now: number): number | null {
  const later = deck.cards.map(c => progress[c.id]?.due ?? 0).filter(due => due > now);
  return later.length ? Math.min(...later) : null;
}

const KEY = (deck: DeckKey) => `wingtip.drill.${deck}`;

/** A deck's progress as kept in this browser (lib/storage); none where
 *  storage cannot be had. */
export function keptProgress(deck: DeckKey): Progress {
  return keptStore<Progress>(KEY(deck), {}).getState().value;
}

/** A private window keeps none: the session still runs, and starts afresh
 *  next time. */
export function keepProgress(deck: DeckKey, progress: Progress): void {
  keptStore<Progress>(KEY(deck), {}).setState({ value: progress });
}
