import { fromChunk } from "../../lib/fromChunk";

/**
 * The route's Share and More menu (ShareMenu) on a chunk of its own, with
 * the stock menus it opens (components/popupsChunk says why they are not
 * in the first load); fetched while the page draws (main.tsx), and drawn
 * by ShareMenuLazy, its room kept until it is in.
 */
export const { Part: ShareMenuPart, prefetch: prefetchShareMenu } = fromChunk(
  () => import("./components/ShareMenu"),
  (m) => m.default,
);
