import { DEFAULT_CHART_DIM } from "../map/chartLook";
import { keptAsIs } from "../storage";
import type { Preferences } from "./state";

/** Where next-themes keeps the page's theme (main.tsx's ThemeProvider):
 *  "system", "light" or "dark", as a bare string. */
export const THEME_KEY = "wingtip.theme";

/** The version the Dimmer came in (version 12, 2026-11-18), where
 *  Appearance's Dark + Bright (chartNight "normal", the chart as printed
 *  under the dark page) went. */
const DIMMER_VERSION = 12;

/** persist's migrate: what was kept read as it is (keptAsIs), but for the
 *  one setting the Dimmer replaced. A pilot who had Dark + Bright (the
 *  page's theme dark, `theme`, and chartNight "normal") keeps the chart
 *  undimmed in the dark, a dark Dimmer of 0; every other pilot gets the
 *  defaults, the chart dimmed at night as before. chartNight is dropped. */
export function migratePreferences(kept: unknown, version: number, theme: string | null): Preferences {
  if (version >= DIMMER_VERSION || !kept || typeof kept !== "object") return keptAsIs<Preferences>(kept);
  const { chartNight, ...rest } = kept as Record<string, unknown>;
  const bright = chartNight === "normal" && theme === "dark";
  return keptAsIs<Preferences>(bright ? { ...rest, chartDim: { ...DEFAULT_CHART_DIM, dark: 0 } } : rest);
}

/** The page's theme as next-themes kept it, or none where storage is
 *  closed (a private window, blocked site data). */
export function keptTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
