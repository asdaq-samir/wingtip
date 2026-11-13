import { lazy } from "react";

/** The flow layer (the owner, 2026-11-11: Windy's and Apple Weather's
 *  wind and weather maps): its tile in the Map card, small and imported as
 *  it is; and the layer itself -- deck.gl and weatherlayers-gl, the
 *  legend, the timeline and the bubble -- a chunk of its own, fetched only
 *  once a field is picked. Lazy here rather than at its caller, so the
 *  module is only ever imported one way (vite-plugins/strictBuild). */
export { FlowTile } from "./FlowTile";
export const FlowGl = lazy(() => import("./FlowGl"));
