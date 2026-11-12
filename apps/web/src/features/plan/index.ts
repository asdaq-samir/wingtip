/** The pilot's planning workspace, as the page's shell mounts it: the
 *  workspace and the map drawn before it (routeMapChunk's BootMap). */
export { default as PlanWorkspace } from "./PlanWorkspace";
export { BootMap } from "./routeMapChunk";

/** The planner's map parts the Studio (features/studio) draws with too,
 *  each on a chunk of its own as the planner's map loads them: the one 3D
 *  view, a replayed track's layers, and the nav log's profile. */
export const loadTerrainGl = () => import("./map/terrain/TerrainGl");
export const loadReplayLayers = () => import("./map/layers/ReplayTrackGl");
export const loadProfileChart = () => import("./components/navlog/ProfileChart");
