import type { Slice } from "./slice";
import type { LookSlice } from "./lookTypes";

export const LOOK_KEPT = ["brand", "flightRules", "ownShipLook"] as const;

export const lookSlice: Slice<LookSlice> = (set) => ({
  brand: "wingtip",
  flightRules: "vfr",
  // The airplane, as it has been drawn since the picker went (2026-11-13).
  ownShipLook: "single",
  setBrand: (brand) => set({ brand }),
  setFlightRules: (flightRules) => set({ flightRules }),
  setOwnShipLook: (ownShipLook) => set({ ownShipLook }),
});
