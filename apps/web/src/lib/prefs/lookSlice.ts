import type { Slice } from "./slice";
import type { LookSlice } from "./lookTypes";

export const LOOK_KEPT = ["brand", "flightRules", "routeEdit", "ownShipLook"] as const;

export const lookSlice: Slice<LookSlice> = (set) => ({
  brand: "wingtip",
  flightRules: "vfr",
  // The box as it was, till the pilot picks another.
  routeEdit: "box",
  // The airplane, as it has been drawn since the picker went (2026-11-13).
  ownShipLook: "single",
  setBrand: (brand) => set({ brand }),
  setFlightRules: (flightRules) => set({ flightRules }),
  setRouteEdit: (routeEdit) => set({ routeEdit }),
  setOwnShipLook: (ownShipLook) => set({ ownShipLook }),
});
