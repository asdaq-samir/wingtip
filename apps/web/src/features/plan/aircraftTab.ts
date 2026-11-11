/**
 * The Aircraft tab -- its strip, its list of airplanes heard and found,
 * its Recents in full -- in a chunk of its own (aircraftTabChunk): a tab
 * drawn only once it is opened, with the airplanes' shapes
 * (components/PlaneMarks) and the search's own fields, no part of the
 * first screen.
 */
export { default as AircraftCard, AircraftFavoriteStrip, AircraftRecentsPage } from "./components/AircraftCard";
export { default as AircraftPill } from "./components/AircraftPill";
