/**
 * The Aircraft tab's lists: the starred and recent airplanes as tiles and
 * rows (on a chunk of their own, aircraftTilesChunk) and the airplane picked.
 */

export { AircraftFavoriteStrip, AircraftRecentRows, AircraftRecentTiles, usePrefetchAircraftTiles } from "./aircraftTilesChunk";
export { useAircraftPick } from "./useAircraftPick";

/** AircraftFavoriteGroups, on a chunk of its own, as its importer loads it. */
export const loadAircraftFavoriteGroups = () => import("./AircraftFavoriteGroups");
