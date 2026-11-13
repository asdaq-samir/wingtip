import type { ReactNode } from "react";
import { Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { BRANDS } from "../lib/brand";
import { usePreferences, type Brand, type ChartNight } from "../lib/preferences";
import type { PullDownOption } from "./PullDown";

/**
 * The app's look, two picks: Theme (Wingtip, Glass Cockpit, Chart ink,
 * Native; lib/brand) and Appearance (System, Light, Dark, Dark + Bright).
 * One source for both of their homes, Setup's tiles (QuickControls) and
 * the first flight's welcome (WelcomeSheet, the owner, 2026-11-13: "give
 * theme and appearance selection on the welcome screen"): each a
 * PullDown's value, options and setter.
 */
interface LookPick<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PullDownOption<V>[];
}

/** Theme: the look's brand, kept in the preferences. */
export function useThemePick(): LookPick<Brand> {
  const value = usePreferences((s) => s.brand);
  const onChange = usePreferences((s) => s.setBrand);
  return { value, onChange, options: BRANDS.map((b) => ({ value: b.value, label: b.label, testId: `brand-${b.value}` })) };
}

type Appearance = "system" | "light" | "dark" | "dark-bright";

/** What each Appearance sets: the page's theme (next-themes) and the chart
 *  at night (lib/preferences chartNight, read only while the page is
 *  dark). Dark dims the chart's tiles with the page, the night's default,
 *  and System and Light leave them so for the dark; Dark + Bright is the
 *  chart as printed under the dark page (the owner, 2026-11-13). */
const APPEARANCES: Record<Appearance, [theme: "system" | "light" | "dark", night: ChartNight]> = {
  system: ["system", "dimmed"],
  light: ["light", "dimmed"],
  dark: ["dark", "dimmed"],
  "dark-bright": ["dark", "normal"],
};

const APPEARANCE_OPTIONS: PullDownOption<Appearance>[] = [
  { value: "system", label: "System", testId: "theme-system" },
  { value: "light", label: "Light", testId: "theme-light" },
  { value: "dark", label: "Dark", testId: "theme-dark" },
  { value: "dark-bright", label: "Dark + Bright", testId: "theme-dark-bright" },
];

/** Appearance, read from the two settings it sets (no third): the page's
 *  theme, and in the dark the chart dimmed or as printed; with its mark. */
export function useAppearancePick(): LookPick<Appearance> & { icon: ReactNode } {
  const { theme, setTheme } = useTheme();
  const chartNight = usePreferences((s) => s.chartNight);
  const setChartNight = usePreferences((s) => s.setChartNight);
  const value: Appearance = theme === "light" ? "light" : theme === "dark" ? (chartNight === "normal" ? "dark-bright" : "dark") : "system";
  const onChange = (appearance: Appearance) => {
    const [mode, night] = APPEARANCES[appearance];
    setTheme(mode);
    setChartNight(night);
  };
  const icon = value === "dark-bright" ? <SunMoon /> : value === "dark" ? <Moon /> : value === "light" ? <Sun /> : <Monitor />;
  return { value, onChange, options: APPEARANCE_OPTIONS, icon };
}
