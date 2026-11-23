/**
 * What Settings and Plates by state draw of Keep for the Air, only inside
 * their own lazily loaded chunk (You): a flight's plates and their size.
 * Nothing on the first load imports this file: index.ts is on it (the map's
 * keep status, Ready to fly), and the bundler keeps every module an imported
 * entry re-exports in the importer's chunk (.dependency-cruiser.cjs,
 * index-not-lazy).
 */

export { aboutMb, flightPlatesLine, useFlightPlates } from "./keepPlates";
