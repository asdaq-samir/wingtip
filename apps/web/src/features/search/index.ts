/**
 * Search's lists: the results and their filters, the nearest airports,
 * Recents and the routes flown before. The one search's field and the
 * model it reads are FPL's (features/fpl), as it draws them.
 */

export { readQuery } from "./searchFilters";
export { useTabSearch } from "./tabSearch";
export { nearOf, useSearchResultRows, useSearchResults } from "./useSearchResults";

/** NearestCard, on a chunk of its own, as its importer loads it. */
export const loadNearestCard = () => import("./NearestCard");

/** SearchResultsPage, on a chunk of its own, as its importer loads it. */
export const loadSearchResultsPage = () => import("./SearchResultsPage");

/** The routes planned before in full (RecentRoutesPage), on a chunk of its own, as its importer loads it. */
export const loadRecentRoutesPage = () => import("./RecentRoutes");

/** FPL's strip of saved flights and routes planned last (FplStrip), drawn
 *  only with no route, on a chunk of its own with Recents' tiles. */
export const loadFplStrip = () => import("./FplStrip");
