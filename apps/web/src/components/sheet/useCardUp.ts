import { useContext, useEffect, useState } from "react";
import { CardId } from "../../lib/sheetCards";
import { useSheetTop } from "./sheetTopSlot";

/** The longest a card's later content waits for its drawer, ms: a drawer
 *  that never says it has come up does not hold it back for good. */
const LATEST_MS = 800;

/**
 * Whether the card this is drawn in has finished coming up (its Drawer's
 * onOpenChangeComplete, sheetTopSlot's cardSettled): for what is past a
 * card's first screen to be drawn after its ease, not in its frames, where
 * the Nav Log's whole list was one long task as the card slid up (the speed
 * audit of 2026-11-21). Once up, up for the card's life; drawn outside a
 * card (CardId), up.
 */
export function useCardUp(): boolean {
  const id = useContext(CardId);
  const upNow = useSheetTop((s) => id === null || s.up.includes(id));
  const [up, setUp] = useState(upNow);
  if (upNow && !up) setUp(true);
  useEffect(() => {
    if (up) return;
    const timer = window.setTimeout(() => setUp(true), LATEST_MS);
    return () => window.clearTimeout(timer);
  }, [up]);
  return up;
}
