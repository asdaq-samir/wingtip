import { fromChunk } from "../../lib/fromChunk";

// The sheet of pages a field's procedures are picked from in flight
// (ProcedureMenu, FieldStep's list), on a chunk of its own with the stock
// list it picks from (ListPicks): on the ground FPL's pills pick from the
// dropdown (ProcedureDropdown), so a route link drew none of it, though
// its 68 KB of list came in the route's first seconds (route-load.spec).
// Asked for once the route has drawn (prefetchTapCards), so it is in hand
// before a flight, drawn straight from the chunk (fromChunk).
export const { Part: ProcedureMenuChunk, prefetch: prefetchProcedureMenu } = fromChunk(
  () => import("./ProcedureMenu"),
  (m) => m.default,
);
