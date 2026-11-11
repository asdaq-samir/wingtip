import { useEffect } from "react";
import { fromChunk } from "../../lib/fromChunk";

// The airplanes' parts on a chunk of their own (aircraftTab), not the
// first load's: the traffic is drawn only once it is opened (PlanSidebar's
// TabKept), and the search's own page has the airplanes' Favorites a moment
// after the airports' -- 20 KB that stood over the 1.10 MB budget
// (scripts/first-load.mjs, 2026-11-09). Asked for a moment after the page
// has drawn (usePrefetchAircraftTab, in PlanSidebar), so each part is drawn
// straight from the chunk (fromChunk), waiting only until then.
const load = () => import("./aircraftTab");
const card = fromChunk(load, (m) => m.AircraftCard);
const recents = fromChunk(load, (m) => m.AircraftRecentsPage);
const pill = fromChunk(load, (m) => m.AircraftPill);
const favorites = fromChunk(load, (m) => m.AircraftFavoriteStrip);
export const AircraftCard = card.Part;
export const AircraftRecentsPage = recents.Part;
export const AircraftPill = pill.Part;
export const AircraftFavoriteStrip = favorites.Part;
/** How long after the page draws the chunk is asked for. */
const AFTER_MS = 2000;
/** One chunk, asked for once the sheet has drawn; each part told it is in hand. */
export function usePrefetchAircraftTab() {
  useEffect(() => {
    const later = window.setTimeout(() => {
      card.prefetch();
      recents.prefetch();
      pill.prefetch();
      favorites.prefetch();
    }, AFTER_MS);
    return () => window.clearTimeout(later);
  }, []);
}
