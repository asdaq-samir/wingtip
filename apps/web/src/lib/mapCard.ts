import { create } from "zustand";

/** The Map card open (MapSettingsButton opens it, MapSettingsCard draws it):
 *  held here, not in the button, which rides the front sheet's top and is
 *  moved from sheet to card (OnSheetTop). One page since its Map Settings
 *  went into the app's Settings (the owner, 2026-11-13). */
export const useMapCard = create<{ open: boolean }>(() => ({ open: false }));

/** The card opened or put away. */
export const showMapCard = (open: boolean) => useMapCard.setState({ open });
