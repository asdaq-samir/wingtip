import { useEffect, useState } from "react";
import { create } from "zustand";
import { useFlying } from "../../lib/mapChrome";
import { useLatestAtcCall } from "../../lib/atc/latestCall";
import { useAtcListen } from "../../lib/atc/listenSetting";
import { listenOnce, startRadio, stopRadio } from "../../lib/atcListening";
import { useCommsAssist } from "../../lib/atc/commsAssist";
import { useAtcRadio, useRadioActions } from "../../lib/atcRadio";
import { useCanListen } from "../../lib/speechLocal";
import { callPattern } from "../../lib/heardCall";
import { heardInto, readBack, shownCard, type AtcCard } from "./atcCards";
import type { AtcItem } from "./atcEngine";
import { actionOf, callLine, type ItemAction } from "./atcWords";

/** The cards, newest first, and the transmissions already read (by id,
 *  with the words read), kept for the page as the radio's log is. */
const useCards = create<{ cards: AtcCard[]; read: Map<number, string>; started: boolean }>(() => ({
  cards: [],
  read: new Map(),
  started: false,
}));

const setCards = (next: (cards: AtcCard[]) => AtcCard[]) => useCards.setState((s) => ({ cards: next(s.cards) }));

/** Listens on and on for our call sign, the copilot having started it. */
function start() {
  const tail = useAtcRadio.getState().tail;
  useCards.setState({ started: true });
  void startRadio([], (tail && callPattern(tail)) || undefined);
}

/** Each settled transmission while the radio is listened to on and on,
 *  into the cards; the microphone's once is read from its pill. */
function onRadio(s: ReturnType<typeof useAtcRadio.getState>) {
  if (s.mode === "radio") {
    const read = useCards.getState().read;
    for (const t of s.heard) {
      if (!t.final || read.get(t.id) === t.text) continue;
      read.set(t.id, t.text);
      setCards((cards) => heardInto(cards, t, s.tail));
    }
  }
  // A Read Back tapped with the radio off: the microphone's pill heard
  // it (lib/atcListening's listenOnce); once it ends it is the card's,
  // and the pill is put away.
  const pill = s.pill;
  const latest = useCards.getState().cards[0];
  if (pill && !pill.listening && pill.text && latest?.awaiting && pill.readbackOf === latest.text) {
    setCards((cards) => [readBack(latest, pill.text, s.tail), ...cards.slice(1)]);
    useAtcRadio.setState({ pill: null });
  }
}

/** What the card offers, each a tap: never done by itself (the owner's
 *  rule, warn never limit; 14 CFR 91.3 leaves the pilot to decide). */
interface AtcCopilot {
  /** The ATC copilot is on (the Map menu's Alerts, ATC). */
  on: boolean;
  card: AtcCard | null;
  /** Listening was meant to start and has not: a tap starts it, as
   *  Safari lets a page listen only from one. */
  needsTap: boolean;
  /** Flying with no call sign to listen for: no airplane with a
   *  registration picked. */
  noTail: boolean;
  error: string | null;
  /** Why the last tap could not do what it asked. */
  problem: string | null;
  /** What a tap on `item` does here, null where the app cannot. */
  can: (item: AtcItem) => ItemAction | null;
  act: (index: number) => Promise<void>;
  listen: () => void;
  readBackNow: () => void;
  dismiss: () => void;
}

/**
 * The ATC copilot (the map's AtcCopilot): while flying, with the pilot's
 * leave, the radio listened to on and on (lib/atcListening, through the
 * audio panel or cable lib/audioInput holds); each call to us read by the
 * engine into a card of its items (atc_call), our readback checked
 * against it (readback_check), and the latest call's line kept for the
 * copilot's banner (lib/atc/latestCall). Nothing is set until a tap.
 */
export function useAtcCopilot(): AtcCopilot {
  // The copilot listens or is not there: where the browser has no
  // recognizer it is off, whatever the setting says.
  const voice = useCanListen();
  // Comms Assist is a Map Settings switch, off until turned on (the owner, 2026-11-13).
  const commsAssist = useCommsAssist((s) => s.value);
  const on = useAtcListen((s) => s.value === "flying") && voice && commsAssist;
  const flying = useFlying((s) => s.flying);
  const tail = useAtcRadio((s) => s.tail);
  const listening = useAtcRadio((s) => s.listening);
  const error = useAtcRadio((s) => s.error);
  const { fly, directTo, enter } = useRadioActions();
  const cards = useCards((s) => s.cards);
  const [problem, setProblem] = useState<string | null>(null);
  const auto = on && flying && !!tail;

  // Listening starts as the flight does and stops with it, where the
  // copilot started it; the Radio card's own listening is the pilot's.
  useEffect(() => {
    const { started } = useCards.getState();
    if (auto && !started && !useAtcRadio.getState().listening) start();
    if (!auto && started) {
      useCards.setState({ started: false });
      if (useAtcRadio.getState().mode === "radio") stopRadio();
    }
  }, [auto]);

  useEffect(() => {
    if (!on) return;
    onRadio(useAtcRadio.getState());
    return useAtcRadio.subscribe(onRadio);
  }, [on]);

  const card = on ? shownCard(cards) : null;

  // The newest call's line for the copilot's banner, which shows it once
  // its card is put away.
  const newest = cards[0] ?? null;
  useEffect(() => {
    if (newest) useLatestAtcCall.setState({ line: callLine(newest.items, newest.text), at: newest.at, cardShown: !newest.dismissed });
  }, [newest]);
  useEffect(() => () => useLatestAtcCall.setState({ cardShown: false }), []);

  const can = (item: AtcItem): ItemAction | null => {
    const action = actionOf(item);
    if (action === "fly" && !fly) return null;
    if (action === "direct" && !directTo) return null;
    if (action === "route" && !enter) return null;
    return action;
  };

  const act = async (index: number) => {
    const item = card?.items[index];
    if (!card || !item) return;
    setProblem(null);
    switch (item.kind) {
      case "altitude":
        fly?.(item.ft);
        break;
      case "direct": {
        const why = await directTo?.(item.said);
        if (why) {
          setProblem(why);
          return;
        }
        break;
      }
      case "frequency":
        useLatestAtcCall.setState({ frequency: item.mhz, facility: item.facility });
        break;
      case "squawk":
        useLatestAtcCall.setState({ squawk: item.code });
        break;
      case "route":
        // The clearance card (ClearanceCard) finds its places and enters
        // the route, as it does from the radio's log.
        useAtcRadio.setState({ cardOpen: true, cardText: card.text });
        break;
      default:
        return;
    }
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, set: [...c.set, index] } : c)));
  };

  const readBackNow = () => {
    if (!card) return;
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, awaiting: true, readback: null } : c)));
    // Listening already, the next transmission is the readback; else the
    // microphone listens once, from this tap.
    if (!useAtcRadio.getState().listening) void listenOnce([], card.text);
  };

  const dismiss = () => {
    if (!card) return;
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, dismissed: true } : c)));
    setProblem(null);
  };

  return {
    on,
    card,
    needsTap: auto && !listening,
    noTail: on && flying && !tail,
    error: on ? error : null,
    problem,
    can,
    act,
    listen: start,
    readBackNow,
    dismiss,
  };
}
