import { lazy } from "react";

/** The flow layer (the owner, 2026-11-11: Windy's and Apple Weather's
 *  wind and weather maps): its menu in the Map menu, small and imported as
 *  it is; and the layer itself -- deck.gl and weatherlayers-gl, the
 *  legend, the timeline and the bubble -- a chunk of its own, fetched only
 *  once a field is picked. Lazy here rather than at its caller, so the
 *  module is only ever imported one way (vite-plugins/strictBuild). */
export { FlowSettingsRow } from "./FlowSettingsRow";
export const FlowGl = lazy(() => import("./FlowGl"));
