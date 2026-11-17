import { useTheme } from "next-themes";
import { usePreferences } from "../../preferences";

/** Whether the page is in the dark theme: next-themes' own answer
 *  (resolvedTheme, "system" read as the device's), where a MutationObserver
 *  watched the class it puts on <html>. The chart's and the route's paint
 *  follow it. */
export function useDarkTheme(): boolean {
  return useTheme().resolvedTheme === "dark";
}

/** The chart's brightest at night: half (glStyle chartPaint's
 *  raster-brightness-max), the imagery and the land and water beside it
 *  the same. */
export const NIGHT_BRIGHTNESS = 0.5;

/** Whether the chart is dimmed for the night: the dark theme, with
 *  Appearance's Dark rather than Dark + Bright (preferences chartNight).
 *  The chart's tiles, the imagery close in and the land and water round
 *  them all follow it. */
export function useChartNight(): boolean {
  const dark = useDarkTheme();
  const chartNight = usePreferences((s) => s.chartNight);
  return dark && chartNight === "dimmed";
}
