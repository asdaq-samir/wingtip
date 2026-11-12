/** The Studio's workspace, on a chunk of its own (MapPage): its loader is
 *  the feature's one entry, so naming it costs a pilot's first load
 *  nothing. */
export const loadStudioWorkspace = () => import("./StudioWorkspace");
