import { fromChunk } from "../../lib/fromChunk";

// The nav log's table, a desktop's side panel's and paper's, on a chunk of
// its own with its columns and TanStack Table: a phone's list (NavLogList)
// draws none of it, though its 26 KB of table came in a route link's first
// seconds (route-load.spec). Asked for once the route has drawn
// (prefetchTapCards), so it is in hand to print, drawn straight from the
// chunk (fromChunk); a desktop waits the moment it takes.
export const { Part: NavLogTableChunk, prefetch: prefetchNavLogTable } = fromChunk(
  () => import("./NavLogTable"),
  (m) => m.NavLogTable,
);
