import { api } from "../api/client";
import type { Box } from "./view";

// The VFR waypoints as the map asks for them (WaypointCard draws their
// card; lib/map/gl/layers/NavaidsGl's WaypointsGl their marks).

/** From this zoom in, the GPS waypoints' (NavaidsLayer's FIX_ZOOM), at
 *  the owner's ask ("Vfr waypoints can show at the zoom level of gps
 *  waypoints too", 2026-11-04): further out their idents would be a
 *  scatter over every city's airspace. */
const FROM_ZOOM = 10;

/** The planner asked for a box's VFR waypoints, from FROM_ZOOM: by the
 *  layer's useQuery and by the map's own events (useAhead) alike. */
export function waypointsQuery(asked: Box, zoom: number) {
  return {
    queryKey: ["waypointsInView", asked.key],
    queryFn: () => api.waypointsInView(asked.box),
    enabled: zoom >= FROM_ZOOM,
    staleTime: Infinity,
    meta: { silent: true },
  };
}
