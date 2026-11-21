/** The flow layer (the owner, 2026-11-11: Windy's and Apple Weather's
 *  wind and weather maps): its submenu in the Map card's Weather menu, small and imported as
 *  it is; and the layer itself -- deck.gl and weatherlayers-gl, the
 *  legend, the timeline and the bubble -- a chunk of its own (flowChunk),
 *  fetched as the Weather menu opens. Loaded there rather than at its
 *  caller, so the module is only ever imported one way
 *  (vite-plugins/strictBuild). */
export { FlowMenu } from "./FlowMenu";
export { FlowGl } from "./flowChunk";
