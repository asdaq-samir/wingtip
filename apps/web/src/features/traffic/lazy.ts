/**
 * An airplane in traffic's card (FlightCard): what it is, where it flies,
 * its registration and photo.
 *
 * What other features draw of the traffic card only inside their own lazily loaded
 * chunks (the route panel, the map, the search's pages). Nothing on the
 * first load imports this file: the bundler keeps every module an imported
 * entry re-exports in the importer's chunk, so these parts reached from
 * index.ts would load with the page (.dependency-cruiser.cjs, index-not-lazy).
 */

export { default as FlightCard } from "./FlightCard";
