import type { SkySpecification } from "maplibre-gl";
import { CHART } from "../../../../lib/tokens";

/** The sky and the haze toward the horizon, by day and over the dimmed
 *  chart at night: MapLibre's sky (its style spec's `sky`), drawn only
 *  where the tilted map shows the horizon. The blends are how far each
 *  colour reaches into the next: the sky into its horizon band, the band
 *  into the haze, and the haze onto the far ground, so distant ridges
 *  fade as they do from a cockpit and the near ground stays as clear as
 *  the chart. */
export function skyOf(night: boolean): SkySpecification {
  const horizon = night ? CHART.skyHorizonNight : CHART.skyHorizon;
  return {
    "sky-color": night ? CHART.skyNight : CHART.sky,
    "horizon-color": horizon,
    "fog-color": horizon,
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.7,
    // No globe's atmosphere: the 3D view is a flat chart stood up.
    "atmosphere-blend": 0,
  };
}
