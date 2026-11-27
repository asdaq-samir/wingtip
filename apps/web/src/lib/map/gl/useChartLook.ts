import { usePreferences } from "../../preferences";
import { useSunlightOn } from "../../sunlight";
import { chartBrightness } from "../chartLook";
import { mapDimOf } from "./mapDim";
import { useDarkTheme } from "./useDarkTheme";

/** How the chart is drawn now: the dark theme's night look, sunlight,
 *  the Dimmer kept for the appearance drawn (lib/prefs chartDim, one for
 *  light and one for dark) and the Contrast offset (chartContrast). What
 *  glStyle's chartPaint takes, and the Map card's sliders show. */
export function useChartLook() {
  const night = useDarkTheme();
  const sunlight = useSunlightOn();
  const dim = usePreferences((s) => s.chartDim[night ? "dark" : "light"]);
  const contrast = usePreferences((s) => s.chartContrast);
  return { night, sunlight, dim, contrast };
}

/** The chart's raster-brightness-max now (chartBrightness), for the
 *  imagery close in and the land and water round the chart, dimmed with it. */
export function useChartBrightness(): number {
  const { dim, sunlight, night } = useChartLook();
  return chartBrightness(dim, sunlight, night);
}

/** What is drawn over the chart at night as a share of its light
 *  (mapDimOf): the chart's brightness at night, 1 by day. For what MapLibre's
 *  global state cannot reach, deck.gl's layers among them. */
export function useMapDim(): number {
  const { dim, sunlight, night } = useChartLook();
  return mapDimOf(night, chartBrightness(dim, sunlight, night));
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
