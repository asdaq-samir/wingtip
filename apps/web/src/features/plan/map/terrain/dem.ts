import type { HillshadeLayerSpecification, RasterDEMSourceSpecification } from "maplibre-gl";
import { absoluteTiles } from "../../../../lib/map/gl/glStyle";

/**
 * The terrain tiles as the map's raster-dem source, and the relief drawn
 * from them: the tiles the planner reads its terrain floors from (its
 * /api/terrain-tile, wingtip.terrain_view), so the ground drawn is the
 * ground the altitudes were planned over.
 *
 * To zoom 13 (some 15 m a pixel at 40 N): the planner builds those ahead
 * round the public-use airports and over steep ground, from USGS 3DEP's
 * 1/3 arc-second (about 10 m), and elsewhere sends its zoom-12 tile's
 * pixels drawn larger (wingtip.terrain_fine); the map draws closer in from
 * them. A tile is the same 256 pixels at every zoom, so the ground's mesh
 * costs a phone's frame the same; the finer ones are only asked close in.
 * The 3D view stands it up by the pilot's Heights (lib/prefs' HeightStretch,
 * TerrainGl), as it does everything over it; the colours against the plan
 * (svColours) read the tiles' own heights, never stretched.
 */

export const DEM = "terrain-dem";
export const HILLSHADE = "terrain-hillshade";
/** The pilot's-eye view's colours on the ground (PilotCamera). */
export const SV_TINT = "terrain-sv";
/** The finest terrain tile asked for, the planner's finest
 *  (wingtip.terrain_view.MAX_ZOOM). */
const DEM_MAX_ZOOM = 13;

export const demSource = (origin: string): RasterDEMSourceSpecification => ({
  type: "raster-dem",
  encoding: "terrarium",
  tileSize: 256,
  minzoom: 3,
  maxzoom: DEM_MAX_ZOOM,
  tiles: [absoluteTiles("/api/planner/terrain-tile/{z}/{x}/{y}.png", origin)],
});

/** The relief over the chart: its shadows, half clear, so the chart's own
 *  colours and words stay as printed in the light; lit from the
 *  north-west, as a sectional's own relief is. */
export const HILLSHADE_LAYER: HillshadeLayerSpecification = {
  id: HILLSHADE,
  type: "hillshade",
  source: DEM,
  paint: {
    "hillshade-exaggeration": 0.35,
    "hillshade-shadow-color": "rgba(40, 32, 20, 0.55)",
    "hillshade-highlight-color": "rgba(255, 255, 255, 0.18)",
    "hillshade-accent-color": "transparent",
    "hillshade-illumination-direction": 315,
  },
};
