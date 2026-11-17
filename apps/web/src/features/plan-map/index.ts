/**
 * The planner's map: the chart with the route, its layers (airports,
 * weather, traffic, tracks, TFRs) and the 3D view (terrain/), on chunks of
 * their own as the planner loads them (routeMapChunk). The Studio
 * (features/studio) draws with the 3D view and a replayed track's layers,
 * and the map settings (features/map-settings) with the 3D view's state.
 */

export { useKeepOffline } from "./keepStatus";
export { BootMap, RouteMap } from "./routeMapChunk";
export { useTrueHeightView } from "./terrain/heightStretch";
export { setPilotView, usePilotView } from "./terrain/pilotView";
export { useTerrainView } from "./terrain/useTerrainView";

/** A replayed track's layers, on a chunk of its own (the Studio draws with them too). */
export const loadReplayLayers = () => import("./layers/ReplayTrackGl");

/** The one 3D view, on a chunk of its own as the planner's map loads it (the Studio draws with it too). */
export const loadTerrainGl = () => import("./terrain/TerrainGl");
