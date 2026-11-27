import { createContext, useContext } from "react";
import type { OneSearchModel } from "./useOneSearch";

/** As much of the one search as the panel round it draws by (PlanSidebar):
 *  the picker's ask, whether its list is up and which, and its calls, the
 *  same functions at every render. Kept (useKept) while those are as they
 *  were, so a keystroke, which makes the whole model again, draws the
 *  search's field and list and not the panel; the parts that show what is
 *  typed read the model itself (useOneSearchModel). */
export interface OneSearchFrame {
  pick: OneSearchModel["pick"];
  /** Its list up: something typed, Direct To asked, or a picker's rows. */
  listed: boolean;
  sent: boolean;
  cancel: OneSearchModel["cancel"];
  letGo: OneSearchModel["letGo"];
  pickIdent: OneSearchModel["pickIdent"];
  refusal: OneSearchModel["refusal"];
}
export const OneSearchFrameContext = createContext<OneSearchFrame | null>(null);

/** The one search's frame (OneSearchFrame), inside OneSearchRoot. */
export function useOneSearchFrame(): OneSearchFrame {
  const frame = useContext(OneSearchFrameContext);
  if (!frame) throw new Error("useOneSearchFrame outside OneSearchRoot");
  return frame;
}
