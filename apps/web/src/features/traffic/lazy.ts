/**
 * An airplane's flight, for the one airplane card (features/airplane's
 * AirplaneCard): its flight and pictures across its top, and its
 * flight's details on its Flights tab.
 *
 * What other features draw of traffic only inside their own lazily loaded
 * chunks (the airplane card's). Nothing on the first load imports this
 * file: the bundler keeps every module an imported entry re-exports in the
 * importer's chunk, so these parts reached from an index.ts would load with
 * the page (.dependency-cruiser.cjs, index-not-lazy).
 */

export { useFlightLive } from "./useFlightLive";
export { FlightNowDetails, FlightPictures } from "./FlightParts";
