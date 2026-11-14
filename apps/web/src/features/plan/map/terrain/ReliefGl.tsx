import { useEffect } from "react";
import { slotId, useGlMap } from "../../../../lib/map/gl/glLayer";
import { DEM, HILLSHADE, HILLSHADE_LAYER, SV_TINT, demSource } from "./dem";

/**
 * The ground's relief shaded over the chart, always (the owner, 2026-11-13:
 * Flat taken out, the 2D chart always shaded): MapLibre's own raster-dem
 * source and hillshade layer (dem.ts), in the map's own script. It was the
 * first effect of the 3D module (TerrainGl), mounted on every map for this
 * alone, and that lazy chunk brought deck.gl with it at every open, in 2D
 * too, 183 KB over the wire before the chart was drawn (the performance
 * audit's PERF-2). The same source and layer, so the relief looks as it
 * did; the 3D module stands the ground up on this source when 3D is on.
 */
export default function ReliefGl() {
  const { map } = useGlMap();
  // The terrain tiles and their relief, over the chart, under the areas.
  useEffect(() => {
    if (!map.getSource(DEM)) map.addSource(DEM, demSource(window.location.origin));
    if (!map.getLayer(HILLSHADE)) map.addLayer(HILLSHADE_LAYER, slotId("imagery"));
    return () => {
      if (!map.style) return;
      // What stands on the tiles let go before them: the 3D ground and the
      // pilot's view's tint (TerrainGl, PilotCamera).
      if (map.getTerrain()) map.setTerrain(null);
      for (const id of [SV_TINT, HILLSHADE]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(DEM)) map.removeSource(DEM);
    };
  }, [map]);
  return null;
}
