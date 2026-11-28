import { fromChunk } from "../../lib/fromChunk";

/** The flow layer itself -- deck.gl and weatherlayers-gl, the legend, the
 *  timeline and the bubble, about 960 KB -- a chunk of its own, imported
 *  only here (vite-plugins/strictBuild): drawn from its module once in
 *  (lib/fromChunk), and asked for as the Weather menu opens (FlowMenu), so
 *  a field picked there is drawn without the second of fetching and
 *  parsing it at a phone's speed first. */
export const { Part: FlowGl, prefetch: prefetchFlowGl } = fromChunk(
  () => import("./FlowGl"),
  (m) => m.default,
);
