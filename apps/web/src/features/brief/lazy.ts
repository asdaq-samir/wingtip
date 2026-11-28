/**
 * What other features draw of the Brief only inside their own lazily loaded
 * chunks (the route panel, the map, the search's pages). Nothing on the
 * first load imports this file: the bundler keeps every module an imported
 * entry re-exports in the importer's chunk, so these parts reached from
 * index.ts would load with the page (.dependency-cruiser.cjs, index-not-lazy).
 */

import { fromChunk } from "../../lib/fromChunk";

export { default as BriefCard } from "./BriefCardPart";
export { prefetchBriefPages } from "./briefPagesChunk";
export { BriefingNotices, default as FlightBriefingView } from "./FlightBriefingView";

/** Save, and the solo cross-country review asked from the route, on a
 *  chunk of their own (SaveFlight): drawn only in the Brief's Share menu,
 *  they were among a route link's first scripts (route-load.spec). */
const loadSaveFlight = () => import("./SaveFlight");
export const { Part: SaveFlightButton } = fromChunk(loadSaveFlight, (m) => m.SaveFlightButton);
export const { Part: ReviewAskItem } = fromChunk(loadSaveFlight, (m) => m.ReviewAskItem);
export const { Part: ReviewAskSheet } = fromChunk(loadSaveFlight, (m) => m.ReviewAskSheet);
export { prefetchAirportSections } from "./airportSectionsChunk";
