import { createContext, useContext } from "react";
import type { OneSearchModel } from "./useOneSearch";

/** The one search's view model, given by OneSearchRoot round the panel to
 *  its field (OneSearchField) and its body (PlanSidebar). */
export const OneSearchContext = createContext<OneSearchModel | null>(null);

/** The one search's view model, inside OneSearchRoot. */
export function useOneSearchModel(): OneSearchModel {
  const model = useContext(OneSearchContext);
  if (!model) throw new Error("useOneSearchModel outside OneSearchRoot");
  return model;
}
