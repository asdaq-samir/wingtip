import { useEffect } from "react";
import { fromChunk } from "../../lib/fromChunk";

// The Aircraft tab on a chunk of its own (aircraftTab), not the first
// load's: the first screen is FPL's, and the tab is drawn only once it is
// opened (PlanSidebar's TabKept), 20 KB that stood over the 1.10 MB budget
// (scripts/first-load.mjs, 2026-11-09). Asked for a moment after the page
// has drawn (usePrefetchAircraftTab, in PlanSidebar), so the tab's first
// tap draws it straight from the chunk (fromChunk), each part waiting
// only until then.
const load = () => import("./aircraftTab");
const card = fromChunk(load, (m) => m.AircraftCard);
const recents = fromChunk(load, (m) => m.AircraftRecentsPage);
const pill = fromChunk(load, (m) => m.AircraftPill);
export const AircraftCard = card.Part;
export const AircraftRecentsPage = recents.Part;
export const AircraftPill = pill.Part;
/** How long after the page draws the chunk is asked for. */
const AFTER_MS = 2000;
/** One chunk, asked for once the tabs have drawn; each part told it is in hand. */
export function usePrefetchAircraftTab() {
  useEffect(() => {
    const later = window.setTimeout(() => {
      card.prefetch();
      recents.prefetch();
      pill.prefetch();
    }, AFTER_MS);
    return () => window.clearTimeout(later);
  }, []);
}
