import { create } from "zustand";

/** Whether the suggested routes' pills are out above FPL's route
 *  (RoutesToggle, FplRoute), kept while the page is: the sheet draws FPL
 *  anew as it moves. */
export const useRoutesShown = create<{ shown: boolean }>(() => ({ shown: false }));
