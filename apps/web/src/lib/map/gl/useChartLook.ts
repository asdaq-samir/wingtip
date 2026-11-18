import { usePreferences } from "../../preferences";
import { useSunlightOn } from "../../sunlight";
import { chartBrightness } from "../chartLook";
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
  const { dim, sunlight } = useChartLook();
  return chartBrightness(dim, sunlight);
}
