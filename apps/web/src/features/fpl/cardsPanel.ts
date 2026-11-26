/**
 * The cards and the in-flight parts a route does not draw as it opens --
 * an airplane's past flight (PastFlightCard, over the one airplane card,
 * features/airplane), the Stops (StopsCard), the dry run's controls and
 * figures and the next checkpoint over the map in flight (FlyingHead) --
 * in a chunk of their own (routePanelParts), fetched a few seconds after
 * the page is idle: they were in the route's panel, and so came with every
 * route opened (the speed audit of 2026-11-21, finding 2).
 */
export { DryRunControls, DryRunFigures, FlyingHead, PastFlightCard } from "../flying/lazy";
export { StopsCard } from "../stops/lazy";
