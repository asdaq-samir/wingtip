import { useTheme } from "next-themes";

/** Whether the page is in the dark theme: next-themes' own answer
 *  (resolvedTheme, "system" read as the device's), where a MutationObserver
 *  watched the class it puts on <html>. The chart's and the route's paint
 *  follow it. */
export function useDarkTheme(): boolean {
  return useTheme().resolvedTheme === "dark";
}
