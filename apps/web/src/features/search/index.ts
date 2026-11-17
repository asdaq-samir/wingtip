/**
 * Search's lists: the results and their filters, the nearest airports,
 * Recents and the routes flown before. The one search's field and the
 * model it reads are FPL's (features/fpl), as it draws them.
 */

export { default as FplStrip } from "./FplStrip";
export { RecentRoutesPage } from "./RecentRoutes";
export { readQuery } from "./searchFilters";
export { useTabSearch } from "./tabSearch";
export { nearOf, useSearchResultRows, useSearchResults } from "./useSearchResults";

/** NearestCard, on a chunk of its own, as its importer loads it. */
export const loadNearestCard = () => import("./NearestCard");

/** SearchResultsPage, on a chunk of its own, as its importer loads it. */
export const loadSearchResultsPage = () => import("./SearchResultsPage");
