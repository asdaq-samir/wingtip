import { useEffect, useState } from "react";

/** The words once they have stopped changing for a moment, so the
 *  planner is not asked at each letter typed or word heard (the
 *  clearance card's reader). */
export function useSettled(text: string, ms: number): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(text), ms);
    return () => window.clearTimeout(id);
  }, [text, ms]);
  return settled;
}
