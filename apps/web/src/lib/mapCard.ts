import { create } from "zustand";

/** The Map card open (MapSettingsButton opens it, MapSettingsCard draws it):
 *  held here, not in the button, which rides the front sheet's top and is
 *  moved from sheet to card (OnSheetTop). */
export const useMapCard = create<{ open: boolean }>(() => ({ open: false }));
