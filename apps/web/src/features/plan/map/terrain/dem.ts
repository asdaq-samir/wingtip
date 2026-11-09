import type { HillshadeLayerSpecification, RasterDEMSourceSpecification } from "maplibre-gl";
import { absoluteTiles } from "../../../../lib/map/gl/glStyle";

/**
 * The terrain tiles as the map's raster-dem source, and the relief drawn
 * from them: the tiles the planner reads its terrain floors from (its
 * /api/terrain-tile, wingtip.terrain_view), so the ground drawn is the
 * ground the altitudes were planned over.
 *
 * Kept light for a phone: no finer than zoom 11 (about 76 m a pixel at
 * the equator, 55 at 44 N), drawn closer in from those, and the ground at
 * its own height, never exaggerated -- which the pilot's-eye view's
 * colours need besides, as they are read against it.
 */

export const DEM = "terrain-dem";
export const HILLSHADE = "terrain-hillshade";
/** The pilot's-eye view's colours on the ground (PilotCamera). */
export const SV_TINT = "terrain-sv";
/** The finest terrain tile asked for (the planner serves to 12). */
const DEM_MAX_ZOOM = 11;
export const EXAGGERATION = 1;
/** As far as the map tilts in 3D. */
export const MAX_PITCH = 75;
/** MapLibre's own most, as the map is made (GlMapShell keeps it flat). */
export const FLAT_MAX_PITCH = 60;
/** The tilt 3D opens at, for the ground to read as ground at once. */
export const OPEN_PITCH = 50;

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
    "hillshade-accent-color": "rgba(0, 0, 0, 0)",
    "hillshade-illumination-direction": 315,
  },
};

/** The sky over a tilted map's horizon, the chart's pale blue. */
export const SKY = {
  "sky-color": "#a9cbe8",
  "horizon-color": "#e6eef6",
  "fog-color": "#e6eef6",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.7,
  "atmosphere-blend": 0,
} as const;
