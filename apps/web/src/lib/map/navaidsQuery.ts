import { api } from "../api/client";
import type { Box } from "./view";

// The VORs and the low enroute chart's fixes as the map asks for them
// (NavaidCards draws their cards; lib/map/gl/layers/NavaidsGl their marks).

/** The VORs from a region's zoom in: a few to a state, each a station a
 *  pilot tunes, and the chart's compass roses round them. */
const VOR_ZOOM = 8;

/** The enroute chart's fixes only close in: further out there are dozens
 *  to a county, a scatter over the chart's own marks. */
const FIX_ZOOM = 10;

/** The planner asked for a box's VORs at a zoom, from VOR_ZOOM, and its
 *  fixes with them from FIX_ZOOM; none where the settings' VORs and Fixes
 *  is off. The layer's useQuery and the map's own events (useAhead) ask
 *  it alike. */
export function navaidsQuery(asked: Box, zoom: number, show: boolean) {
  const withFixes = zoom >= FIX_ZOOM;
  return {
    queryKey: ["navaidsInView", asked.key, withFixes],
    queryFn: () => api.navaidsInView(asked.box, withFixes),
    enabled: show && zoom >= VOR_ZOOM,
    staleTime: Infinity,
    meta: { silent: true },
  };
}
