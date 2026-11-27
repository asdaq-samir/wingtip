import { useCallback, useState } from "react";
import { useTabScroll } from "./tabScroll";

/** Each card's tab picked, by the airport's own key. */
const kept = new Map<string, string>();

/**
 * The tab a card is on: the one picked for this airport while the page is
 * open, else the one it opens on (`initial`), else `fallback`.
 */
function useCardTab<T extends string>(key: string, fallback: T, initial?: T | null): [T, (tab: T) => void] {
  const [picked, setPicked] = useState<T | null>(() => (kept.get(key) as T | undefined) ?? initial ?? null);
  const pick = useCallback(
    (tab: T) => {
      kept.set(key, tab);
      setPicked(tab);
    },
    [key],
  );
  return [picked ?? fallback, pick];
}

/** A card's tabs (components/CardTabs): the tab up and its pick, kept by
 *  the card's `key` ("place:KOSH", "airplane:a1b2c3") while the page is
 *  open (useCardTab); and `top`, CardTabPages' mark setter (`topNode` the
 *  mark itself), each tab opening at its own top (useTabScroll). The
 *  airport card's and the airplane card's, the one way. */
export function useCardTabs<T extends string>(key: string, fallback: T, initial?: T | null) {
  const [tab, pick] = useCardTab<T>(key, fallback, initial);
  const [topNode, top] = useTabScroll(tab);
  return { tab, pick, top, topNode };
}
