import type { PlannedRoute } from "./atcRadio";

/** A route as one line: its ends and the points between. */
export const routeLine = (r: PlannedRoute) => [r.dep, ...r.stops, r.dest].filter(Boolean).join(" → ") || "none";

/** The microphone beside a row, in the tint, its 44-point hit area a
 *  pseudo-element round the stock 36; and the small button's round its
 *  32. */
export const ROW_MIC = "relative shrink-0 hit-1";
export const ROW_BUTTON = "relative shrink-0 hit-y-1.5";
