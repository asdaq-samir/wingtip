import { Monitor, Moon, Palette, Sun, SunDim, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { BRANDS } from "../lib/brand";
import { usePreferences, type Brand, type ChartLight, type OwnShipLook } from "../lib/preferences";
import { OWN_SHIP_LOOKS, ownShipSvg } from "../lib/map/position/ownShipLook";
import type { PullDownOption } from "./PullDown";
import { LayerMenuTile } from "./LayerTile";
import { LOOK_SWATCH } from "../lib/tokens";

/**
 * The app's look, two picks: Theme (Wingtip, Glass Cockpit, Chart ink,
 * Native; lib/brand) and Appearance (System, Light, Dark).
 * One source for both of their homes, the Map card's Look and
 * the first flight's welcome (WelcomeSheet, the owner, 2026-11-13: "give
 * theme and appearance selection on the welcome screen"): each a
 * PullDown's value, options and setter, drawn as the same two tiles in
 * both (ThemeTile, AppearanceTile; LayerMenuTile, the layers' tile with
 * its value under its name and a tap its menu: the welcome had tiles of
 * its own, a glyph in a disc beside the words, until 2026-11-17), with
 * Sunlight's after them on the Map card (SunlightTile; the owner,
 * 2026-11-14: "Sunlight should
 * also move to map settings", "every section should have 4 tiles like
 * Layers one"), and the chart's Dimmer and Contrast sliders under the
 * tiles there (features/map-settings' ChartLookRows; the owner,
 * 2026-11-18).
 */
interface LookPick<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PullDownOption<V>[];
}

/** A look's swatch beside its name in the menu: its tint on its sheet by
 *  day (tokens' LOOK_SWATCH), so Wingtip and Chart ink, both blue, are
 *  told apart by their paper. Edged, so a white sheet holds on a white menu. */
function Swatch({ brand }: { brand: Brand }) {
  const { tint, ground } = LOOK_SWATCH[brand];
  return (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border border-input" style={{ background: ground }}>
      <span className="size-2 rounded-full" style={{ background: tint }} />
    </span>
  );
}

/** Theme: the look's brand, kept in the preferences. */
function useThemePick(): LookPick<Brand> {
  const value = usePreferences((s) => s.brand);
  const onChange = usePreferences((s) => s.setBrand);
  return {
    value,
    onChange,
    options: BRANDS.map((b) => ({
      value: b.value,
      label: (
        <span className="flex items-center gap-2">
          <Swatch brand={b.value} />
          {b.label}
        </span>
      ),
      text: b.label,
      testId: `brand-${b.value}`,
    })),
  };
}

type Appearance = "system" | "light" | "dark";

const APPEARANCE_OPTIONS: PullDownOption<Appearance>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light", testId: "theme-light" },
  { value: "dark", label: "Dark", testId: "theme-dark" },
];

/** Appearance: the page's theme (next-themes), System the device's. How
 *  far the chart is dimmed is the Map card's Dimmer, one for each
 *  appearance (lib/map/chartLook), where Dark + Bright was the chart
 *  undimmed under the dark page until 2026-11-18 (the owner: "can we have
 *  a dimmer and contrast sliders under sunlight and remove it from the
 *  appearance?"). */
function useAppearancePick(): LookPick<Appearance> {
  const { theme, setTheme } = useTheme();
  const value: Appearance = theme === "light" || theme === "dark" ? theme : "system";
  return { value, onChange: setTheme, options: APPEARANCE_OPTIONS };
}

/** Theme's tile (LayerMenuTile): its value under its name, a tap its menu. */
export function ThemeTile() {
  return <LayerMenuTile name="Theme" glyph={Palette} {...useThemePick()} testId="brand-select" />;
}

/** Appearance's tile, its glyph the one picked. */
export function AppearanceTile() {
  const pick = useAppearancePick();
  const glyph = pick.value === "dark" ? Moon : pick.value === "light" ? Sun : Monitor;
  return <LayerMenuTile name="Appearance" glyph={glyph} {...pick} testId="theme-select" />;
}

const SUNLIGHT_OPTIONS: PullDownOption<ChartLight>[] = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On", testId: "sunlight-on" },
  { value: "off", label: "Off", testId: "sunlight-off" },
];

/** Sunlight's tile on the Map card: the chart in bright sunlight
 *  (lib/sunlight), from the phone's light sensor where the browser has one
 *  (Auto), or by hand, in the cockpit, where a pilot needs it at a tap; in
 *  the tint while On, as a layer that is on. It was Settings' Display tile
 *  and moved here with the rest of the look (the owner, 2026-11-14). While
 *  it is on the chart is at full brightness, the Dimmer under the tiles
 *  greyed but keeping its value (map-settings' ChartLookRows). */
export function SunlightTile() {
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
export function OwnShipTile() {
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
