import { usePreferences } from "../../preferences";
import { useSunlightOn } from "../../sunlight";
import { chartBrightness } from "../chartLook";
import { useChartLookPreview } from "./chartLookPreview";
import { mapDimOf } from "./mapDim";
import { useDarkTheme } from "./useDarkTheme";

/** How the chart is drawn now: the dark theme's night look, sunlight,
 *  the Dimmer for the appearance drawn and the Contrast offset, each a
 *  slider's value while it moves (chartLookPreview), else the one kept
 *  (lib/prefs chartDim, one for light and one for dark; chartContrast);
 *  and `keptDim`, the Dimmer as last committed, which what is drawn over
 *  the chart follows (useMapDim). What glStyle's chartPaint takes, and
 *  the Map card's sliders show. */
export function useChartLook() {
  const night = useDarkTheme();
  const sunlight = useSunlightOn();
  const keptDim = usePreferences((s) => s.chartDim[night ? "dark" : "light"]);
  const keptContrast = usePreferences((s) => s.chartContrast);
  const preview = useChartLookPreview();
  return { night, sunlight, dim: preview.dim ?? keptDim, contrast: preview.contrast ?? keptContrast, keptDim };
}

/** The chart's raster-brightness-max now (chartBrightness), for the
 *  imagery close in and the land and water round the chart, dimmed with it. */
export function useChartBrightness(): number {
  const { dim, sunlight, night } = useChartLook();
  return chartBrightness(dim, sunlight, night);
}

/** What is drawn over the chart at night as a share of its light
 *  (mapDimOf): the chart's brightness at night, 1 by day, from the Dimmer
 *  as committed, so a drag's steps reach only the chart's raster; a change
 *  of the theme or of sunlight at once. ChartGl's MAP_DIM, and what
 *  MapLibre's global state cannot reach, deck.gl's layers among them. */
export function useMapDim(): number {
  const { keptDim, sunlight, night } = useChartLook();
  return mapDimOf(night, chartBrightness(keptDim, sunlight, night));
}

/** The same share read from what is kept, outside React, for a map whose
 *  layers come before ChartGl has set it (useGlLayer): the dark class on
 *  <html> (public/first-frame.js, then next-themes), Sunlight's mark there
 *  (lib/sunlight) and the kept Dimmer. */
export function keptMapDim(): number {
  const root = document.documentElement;
  const night = root.classList.contains("dark");
  const dim = usePreferences.getState().chartDim[night ? "dark" : "light"];
  return mapDimOf(night, chartBrightness(dim, root.dataset.chartLight === "bright", night));
}
