import { create } from "zustand";

/** The FPL tab (SheetTabBar) while it is drawn, for what points at it
 *  (the first flight's FPL tip, FplTip): null where the bar is not
 *  (flying, under Settings). One bar is drawn at a time, the floating one
 *  or the side panel's. */
export const usePlanTab = create<{ el: HTMLElement | null }>(() => ({ el: null }));

/** The FPL tab's ref: kept while it is drawn, let go only if no other bar
 *  has taken its place since. */
export function keepPlanTab(el: HTMLElement | null) {
  usePlanTab.setState({ el });
  return () => {
    if (usePlanTab.getState().el === el) usePlanTab.setState({ el: null });
  };
}
