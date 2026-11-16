import { useEffect } from "react";
import { fromChunk } from "../../lib/fromChunk";

// The airplanes' tiles and rows on a chunk of their own (aircraftTiles), not
// the first load's: the search's own page has the airplanes' Favorites and
// Recents a moment after the airports' -- 20 KB that stood over the 1.10 MB
// budget (scripts/first-load.mjs, 2026-11-09). Asked for a moment after the
// page has drawn (usePrefetchAircraftTiles, in PlanSidebar), so each part is
// drawn straight from the chunk (fromChunk), waiting only until then.
const load = () => import("./aircraftTiles");
const favorites = fromChunk(load, (m) => m.AircraftFavoriteStrip);
const recentTiles = fromChunk(load, (m) => m.AircraftRecentTiles);
const recentRows = fromChunk(load, (m) => m.AircraftRecentRows);
export const AircraftFavoriteStrip = favorites.Part;
export const AircraftRecentTiles = recentTiles.Part;
export const AircraftRecentRows = recentRows.Part;
/** How long after the page draws the chunk is asked for. */
const AFTER_MS = 2000;
/** One chunk, asked for once the sheet has drawn; each part told it is in hand. */
export function usePrefetchAircraftTiles() {
  useEffect(() => {
    const later = window.setTimeout(() => {
      favorites.prefetch();
      recentTiles.prefetch();
      recentRows.prefetch();
    }, AFTER_MS);
    return () => window.clearTimeout(later);
  }, []);
}
