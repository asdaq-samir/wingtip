import { useRef } from "react";
import { sameFields } from "../../../lib/steady";

/**
 * The object made last render, while each of its values is the same as
 * this render's: the planner's view model's slices (usePlanWorkspace) are
 * built afresh at each render, as hooks the React Compiler leaves alone
 * (their "use no memo", for the first load's size), and a new slice with
 * nothing new in it drew every part handed it again -- the minute's clock,
 * a search's keystroke or one query's answer drew the map, the sheet's
 * pages and FPL's cards. Kept, a part
 * whose slices are as they were is skipped.
 *
 * Kept in a ref written as the render goes, which React's lint refuses
 * for a ref that draws something: this one only stands for an object with
 * the same values, so one kept from a render React threw away is as good
 * as the one it stands for, and nothing is drawn from it that the values
 * would not draw.
 */
export function useKept<T extends object>(next: T): T {
  "use no memo"; // As the slices that call it.
  const kept = useRef(next);
  // eslint-disable-next-line react-hooks/refs -- a cache of equal values, above
  if (!sameFields(kept.current, next)) kept.current = next;
  // eslint-disable-next-line react-hooks/refs -- as above
  return kept.current;
}
