/**
 * The ATC copilot's cards from what the radio says, one transmission at a
 * time (useAtcCopilot): a call to us makes a card with its items; our
 * own transmission after it -- the mic side, where the audio panel sends
 * it, or what the pilot said after tapping Read Back -- is that card's
 * readback, checked by the engine. Who said what is the engine's
 * (atc_call); this keeps the cards. Pure, so the tests run it over the
 * shared fixture without a page.
 */
import { atcCall, readbackOf, type AtcItem, type ReadbackAnswer } from "./atcEngine";

export interface AtcCard {
  /** The transmission's id (lib/atcRadio). */
  id: number;
  text: string;
  /** When it began, ms. */
  at: number;
  items: AtcItem[];
  /** The pilot's readback and how it matched, once heard. */
  readback: { said: string; check: ReadbackAnswer } | null;
  /** The pilot tapped Read Back: the next transmission heard is it. */
  awaiting: boolean;
  /** Put away by the pilot. */
  dismissed: boolean;
  /** The items set with a tap, by their place in `items`. */
  set: number[];
}

/** As many calls as are kept, newest first: the card shows the newest. */
export const KEPT_CARDS = 4;
/** How long after a call our own transmission is still its readback, ms:
 *  past that it answers something else. */
export const READBACK_WINDOW_MS = 60_000;

/** The cards after `heard` (a settled transmission), our airplane's
 *  registration being `tail`. With no tail nothing is ours, and the
 *  cards stay as they were. */
export function heardInto(cards: AtcCard[], heard: { id: number; text: string; at: number }, tail: string | null): AtcCard[] {
  const latest = cards[0] ?? null;
  const open = latest && !latest.readback && heard.at - latest.at <= READBACK_WINDOW_MS ? latest : null;
  const answer = atcCall(heard.text, tail, open ? { text: open.text, agoS: (heard.at - open.at) / 1000 } : null);
  if (answer.who === "to_us") {
    const card: AtcCard = {
      id: heard.id,
      text: heard.text,
      at: heard.at,
      items: answer.items,
      readback: null,
      awaiting: false,
      dismissed: false,
      set: [],
    };
    return [card, ...cards].slice(0, KEPT_CARDS);
  }
  if (open && (answer.who === "from_us" || open.awaiting)) return [readBack(open, heard.text, tail), ...cards.slice(1)];
  return cards;
}

/** The card with `said` as its readback, checked. */
export function readBack(card: AtcCard, said: string, tail: string | null): AtcCard {
  return { ...card, awaiting: false, readback: { said, check: readbackOf(card.text, said, tail) } };
}

/** The card shown: the newest, unless put away. */
export function shownCard(cards: AtcCard[]): AtcCard | null {
  const latest = cards[0];
  return latest && !latest.dismissed ? latest : null;
}
