/**
 * The cards of a place on the map -- an airport's, a navaid's or a
 * waypoint's (PlaceCard), and an airspace's held on the map (AirspaceCard)
 * -- in a chunk of their own (routePanelParts), drawn only at a tap: they
 * were in the route's panel, and so came with every route opened. Fetched a few seconds after the
 * page is idle, so a tap still opens one at once.
 */
export { AirspaceCard, PlaceCard } from "../place/lazy";
