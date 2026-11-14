import type { ReactNode } from "react";
import { Monitor, Moon, Palette, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { BRANDS } from "../lib/brand";
import { usePreferences, type Brand, type ChartLight, type ChartNight } from "../lib/preferences";
import MenuTile from "./MenuTile";
import PullDown, { type PullDownOption } from "./PullDown";
import { ListRow } from "./GroupedList";

/**
 * The app's look, two picks: Theme (Wingtip, Glass Cockpit, Chart ink,
 * Native; lib/brand) and Appearance (System, Light, Dark, Dark + Bright).
 * One source for both of their homes, the Map card's Look and
 * the first flight's welcome (WelcomeSheet, the owner, 2026-11-13: "give
 * theme and appearance selection on the welcome screen"): each a
 * PullDown's value, options and setter, drawn as tiles (ThemeTile,
 * AppearanceTile) on the welcome, and as rows of an inset grouped list on
 * the Map card (ThemeRow, AppearanceRow), its label at the left and the
 * pick's pull-down at the right, as iOS Settings sets a choice (the
 * owner's "How can this be better?", 2026-11-14), with Sunlight's row
 * after them (SunlightRow; the owner, 2026-11-14: "Sunlight should also
 * move to map settings").
 */
interface LookPick<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PullDownOption<V>[];
}

/** Theme: the look's brand, kept in the preferences. */
function useThemePick(): LookPick<Brand> {
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
function useAppearancePick(): LookPick<Appearance> & { icon: ReactNode } {
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

/** Theme's tile (MenuTile). */
export function ThemeTile() {
  return <MenuTile label="Theme" {...useThemePick()} on={false} testId="brand-select" icon={<Palette />} />;
}

/** Appearance's tile (MenuTile), its mark the one picked. */
export function AppearanceTile() {
  const { icon, ...pick } = useAppearancePick();
  return <MenuTile label="Appearance" {...pick} on={false} testId="theme-select" icon={icon} />;
}

/** Theme's row of a grouped list (ListRow): its name, and the pick's
 *  pull-down at its end. */
export function ThemeRow() {
  return (
    <ListRow title="Theme">
      <PullDown label="Theme" {...useThemePick()} align="end" testId="brand-select" />
    </ListRow>
  );
}

/** Appearance's row of a grouped list, as Theme's. */
export function AppearanceRow() {
  const { value, onChange, options } = useAppearancePick();
  return (
    <ListRow title="Appearance">
      <PullDown label="Appearance" value={value} onChange={onChange} options={options} align="end" testId="theme-select" />
    </ListRow>
  );
}

const SUNLIGHT_OPTIONS: PullDownOption<ChartLight>[] = [
  { value: "auto", label: "Auto", testId: "sunlight-auto" },
  { value: "on", label: "On", testId: "sunlight-on" },
  { value: "off", label: "Off", testId: "sunlight-off" },
];

/** Sunlight's row, as Theme's: the chart in bright sunlight (lib/sunlight),
 *  from the phone's light sensor where the browser has one (Auto), or by
 *  hand, in the cockpit, where a pilot needs it at a tap. It was Settings'
 *  Display tile and moved here with the rest of the look (the owner,
 *  2026-11-14), so it has one home. */
export function SunlightRow() {
  const value = usePreferences((s) => s.chartLight);
  const onChange = usePreferences((s) => s.setChartLight);
  return (
    <ListRow title="Sunlight">
      <PullDown label="Sunlight" value={value} onChange={onChange} options={SUNLIGHT_OPTIONS} align="end" testId="sunlight-select" />
    </ListRow>
  );
}
