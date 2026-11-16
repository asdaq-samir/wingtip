import type { ReactNode } from "react";
import { Monitor, Moon, Palette, Sun, SunDim, SunMedium, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { BRANDS } from "../lib/brand";
import { usePreferences, type Brand, type ChartLight, type ChartNight, type OwnShipLook } from "../lib/preferences";
import { OWN_SHIP_LOOKS, ownShipSvg } from "../lib/map/position/ownShipLook";
import MenuTile from "./MenuTile";
import type { PullDownOption } from "./PullDown";
import { LayerMenuTile } from "./LayerTile";

/**
 * The app's look, two picks: Theme (Wingtip, Glass Cockpit, Chart ink,
 * Native; lib/brand) and Appearance (System, Light, Dark, Dark + Bright).
 * One source for both of their homes, the Map card's Look and
 * the first flight's welcome (WelcomeSheet, the owner, 2026-11-13: "give
 * theme and appearance selection on the welcome screen"): each a
 * PullDown's value, options and setter, drawn as tiles (ThemeTile,
 * AppearanceTile) on the welcome, and as the Map card's Look tiles
 * (ThemeLayerTile, AppearanceLayerTile; LayerMenuTile, the layers' tile
 * with its value under its name and a tap its menu), with Sunlight's
 * after them (SunlightLayerTile; the owner, 2026-11-14: "Sunlight should
 * also move to map settings", "every section should have 4 tiles like
 * Layers one").
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

/** Theme's tile on the Map card (LayerMenuTile): its value under its
 *  name, a tap its menu. */
export function ThemeLayerTile() {
  return <LayerMenuTile name="Theme" glyph={Palette} {...useThemePick()} testId="brand-select" />;
}

/** Appearance's tile on the Map card, its glyph the one picked. */
export function AppearanceLayerTile() {
  const { value, onChange, options } = useAppearancePick();
  const glyph = value === "dark-bright" ? SunMoon : value === "dark" ? Moon : value === "light" ? Sun : Monitor;
  return <LayerMenuTile name="Appearance" glyph={glyph} value={value} onChange={onChange} options={options} testId="theme-select" />;
}

const SUNLIGHT_OPTIONS: PullDownOption<ChartLight>[] = [
  { value: "auto", label: "Auto", testId: "sunlight-auto" },
  { value: "on", label: "On", testId: "sunlight-on" },
  { value: "off", label: "Off", testId: "sunlight-off" },
];

/** Sunlight's tile on the Map card: the chart in bright sunlight
 *  (lib/sunlight), from the phone's light sensor where the browser has one
 *  (Auto), or by hand, in the cockpit, where a pilot needs it at a tap; in
 *  the tint while On, as a layer that is on. It was Settings' Display tile
 *  and moved here with the rest of the look (the owner, 2026-11-14). */
export function SunlightLayerTile() {
  const value = usePreferences((s) => s.chartLight);
  const onChange = usePreferences((s) => s.setChartLight);
  const glyph = value === "on" ? Sun : value === "off" ? SunDim : SunMedium;
  return (
    <LayerMenuTile
      name="Sunlight"
      glyph={glyph}
      value={value}
      onChange={onChange}
      options={SUNLIGHT_OPTIONS}
      on={value === "on"}
      testId="sunlight-select"
    />
  );
}

const OWN_SHIP_OPTIONS: PullDownOption<OwnShipLook>[] = OWN_SHIP_LOOKS.map((o) => ({ ...o, testId: `own-ship-${o.value}` }));

/** A look's own drawing as the tile's glyph, in the tile's colour: what the
 *  chart will draw, not a stand-in (lib/map/position/ownShipLook). */
function drawnGlyph(look: OwnShipLook) {
  const svg = ownShipSvg(look, "currentColor", 20);
  return function OwnShipGlyph({ className }: { className?: string }) {
    return <span aria-hidden="true" className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
  };
}
const OWN_SHIP_GLYPHS: Record<OwnShipLook, ReturnType<typeof drawnGlyph>> = {
  single: drawnGlyph("single"),
  twin: drawnGlyph("twin"),
  jet: drawnGlyph("jet"),
  arrow: drawnGlyph("arrow"),
};

/** Own Ship's tile on the Map card: how own ship is drawn on the chart --
 *  the Airplane, a Twin, a Jet or the Arrow (a dot with no heading) -- its
 *  glyph the one picked, drawn as the chart draws it. The look's fourth
 *  tile at the owner's ask (2026-11-14: "Maybe replace the position with
 *  the choice of own ship?"), back after You on the Map went on 2026-11-13. */
export function OwnShipLayerTile() {
  const value = usePreferences((s) => s.ownShipLook);
  const onChange = usePreferences((s) => s.setOwnShipLook);
  return (
    <LayerMenuTile
      name="Own Ship"
      glyph={OWN_SHIP_GLYPHS[value]}
      value={value}
      onChange={onChange}
      options={OWN_SHIP_OPTIONS}
      testId="own-ship-select"
    />
  );
}
