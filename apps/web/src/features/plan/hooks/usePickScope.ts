import { useEffect, useRef } from "react";
import { useSearchPick } from "../../../lib/oneSearch";

/**
 * A picker's ask of the one search (lib/oneSearch askSearchPick), and the
 * view it was asked from, to go back to once the airport is picked: the
 * plan for the route's own points, the traffic for its airport. Followed
 * while nothing is asked, then held for the ask.
 */
export function usePickScope<View>(view: View) {
  const pick = useSearchPick((s) => s.pick);
  const from = useRef(view);
  useEffect(() => {
    if (!pick) from.current = view;
  }, [pick, view]);
  return { pick, from };
}
