import { useTheme } from "next-themes";

/** Whether the page is in the dark theme: next-themes' own answer
 *  (resolvedTheme, "system" read as the device's), where a MutationObserver
 *  watched the class it puts on <html>. The night's look follows it: the
 *  chart's contrast and colour, the route's colours and the 3D sky; how
 *  far the chart is dimmed is the Dimmer's (useChartLook). */
export function useDarkTheme(): boolean {
  return useTheme().resolvedTheme === "dark";
}
