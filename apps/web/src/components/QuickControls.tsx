import type { ReactNode } from "react";
import { ChevronsUpDown, Monitor, Moon, Palette, PanelBottom, PanelTop, Sun, SunDim, SunMedium, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "cn";
import PullDown, { type PullDownOption } from "./PullDown";
import { usePreferences, type Brand, type ChartLight, type ChartNight, type NavEdge } from "../lib/preferences";
import { BRANDS } from "../lib/brand";
import { useNavEdge } from "../hooks/use-nav-edge";
import { TEXT } from "../lib/text";

/**
 * Setup's Layout, once Controls, the home of the four things a pilot
 * changes in the cockpit, at the owner's split (2026-10-27): "Controls can be alerts,
 * offline, layout, theme", everything else in the map's menu, and no
 * Settings page; App Look in Offline's place since (the owner, the same
 * day), the charts kept offline in the map's menu. Four big tiles, as iOS's Control Center lays its out, at
 * the owner's pick of the Setup canvas (T3): each a round mark filled in
 * the tint while on, its name, and its setting under it. Alerts, Layout
 * and Theme are a pick of a few, a tap their menu, as Apple Maps' voice
 * is -- not a cycle a pilot cannot foresee; Offline is on or off.
 *
 * Traffic went to the map's menu, a layer of the map's, and Dark became
 * Theme, keeping System, which a Dark switch could not say. The alerts
 * went to the map's menu (MapSettings) on 2026-11-05, FPL taking their
 * place; on 2026-11-13 the owner put Sunlight in FPL's place and FPL's
 * layout on the page it changes: how FPL shows its route is its route's
 * ••• menu's Show Route As (ShowRouteAs), at the owner's ask ("I want to
 * move fpl layout to the fpl page"). The same day Appearance took in the
 * map settings' Chart at Night as a fourth pick, Dark + Bright.
 */
export default function QuickControls() {
  const brand = usePreferences((s) => s.brand);
  const setBrand = usePreferences((s) => s.setBrand);
  const setNavBar = usePreferences((s) => s.setNavBar);
  const chartLight = usePreferences((s) => s.chartLight);
  const setChartLight = usePreferences((s) => s.setChartLight);
  const edge = useNavEdge();
  const { theme, setTheme } = useTheme();
  const chartNight = usePreferences((s) => s.chartNight);
  const setChartNight = usePreferences((s) => s.setChartNight);
  // The Appearance's pick, read from the two settings it sets (no third):
  // the page's theme, and in the dark the chart dimmed or as printed.
  const picked: Appearance = theme === "light" ? "light" : theme === "dark" ? (chartNight === "normal" ? "dark-bright" : "dark") : "system";
  const pickAppearance = (appearance: Appearance) => {
    const [mode, night] = APPEARANCES[appearance];
    setTheme(mode);
    setChartNight(night);
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2" data-testid="quick-controls">
        {/* The chart in bright sunlight (lib/sunlight): from the phone's
          light sensor where the browser has one, or by hand -- in the
          cockpit, where a pilot needs it at a tap. Its mark in the tint
          while On, as Control Center's tiles show theirs. */}
        <MenuTile<ChartLight>
          label="Sunlight"
          value={chartLight}
          onChange={setChartLight}
          on={chartLight === "on"}
          testId="sunlight-select"
          icon={chartLight === "on" ? <Sun /> : chartLight === "off" ? <SunDim /> : <SunMedium />}
          options={[
            { value: "auto", label: "Auto", testId: "sunlight-auto" },
            { value: "on", label: "On", testId: "sunlight-on" },
            { value: "off", label: "Off", testId: "sunlight-off" },
          ]}
        />
        {/* The app's look, Wingtip, Glass Cockpit, Chart ink or Native (lib/brand), its Theme, where
          Offline was, named so at the owner's yes (2026-10-27): what most
          apps call a theme, and System, Light and Dark iOS's Appearance.
          It was "App Look", put here at the owner's ask ("instead of
          offline, let's have app look"); the charts kept offline went to
          the map's menu. */}
        <MenuTile<Brand>
          label="Theme"
          value={brand}
          onChange={setBrand}
          on={false}
          testId="brand-select"
          icon={<Palette />}
          options={BRANDS.map((b) => ({ value: b.value, label: b.label, testId: `brand-${b.value}` }))}
        />
        {/* The edge the route panel is on, which the sheets come from too
          and the map's buttons keep clear of (useNavEdge). Position, where
          it was Layout, the section's name since (the owner, 2026-11-05). */}
        <MenuTile<NavEdge>
          label="Position"
          value={edge}
          onChange={setNavBar}
          on={false}
          testId="nav-bar-select"
          icon={edge === "top" ? <PanelTop /> : <PanelBottom />}
          options={[
            { value: "top", label: "Top", testId: "nav-bar-top" },
            { value: "bottom", label: "Bottom", testId: "nav-bar-bottom" },
          ]}
        />
        {/* Light or dark, Appearance as iOS names it (Display & Brightness),
          next-themes keeping it and following the phone on System: a
          pilot planning at night wants the page as dim as the panel
          lights. Dark dims the chart's tiles too, for night vision; Dark +
          Bright keeps them as printed, the map settings' Chart at Night
          folded in (the owner, 2026-11-13; APPEARANCES). */}
        <MenuTile<Appearance>
          label="Appearance"
          value={picked}
          onChange={pickAppearance}
          on={false}
          testId="theme-select"
          icon={picked === "dark-bright" ? <SunMoon /> : picked === "dark" ? <Moon /> : picked === "light" ? <Sun /> : <Monitor />}
          options={[
            { value: "system", label: "System", testId: "theme-system" },
            { value: "light", label: "Light", testId: "theme-light" },
            { value: "dark", label: "Dark", testId: "theme-dark" },
            { value: "dark-bright", label: "Dark + Bright", testId: "theme-dark-bright" },
          ]}
        />
      </div>
    </>
  );
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

/** A control's tile: a rounded card, its mark at the left, its name over
 *  its setting. Its own height is past 44, so it needs no area of its
 *  own. */
const TILE = cn(
  "group flex h-auto min-h-14 w-full min-w-0 items-center justify-start gap-2.5 rounded-2xl bg-card px-2.5 py-2 text-left outline-none",
  "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-pressed:bg-card",
);

function Face({ icon, label, value, menu = false }: { icon: ReactNode; label: string; value: string; menu?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-foreground group-data-pressed:bg-primary group-data-pressed:text-primary-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-semibold text-foreground", TEXT.detail)}>{label}</span>
        <span className={cn("flex items-center gap-0.5 truncate", menu ? "text-tint" : "text-muted-foreground", TEXT.note)}>
          {value}
          {menu && <ChevronsUpDown className="size-3 shrink-0" aria-hidden />}
        </span>
      </span>
    </>
  );
}

/** A tile that is a pick of a few: a tap its menu (PullDown), the one
 *  picked under its name. */
function MenuTile<V extends string>({
  label,
  value,
  onChange,
  options,
  icon,
  on,
  testId,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: PullDownOption<V>[];
  icon: ReactNode;
  /** Its mark filled in the tint, as a toggle's while on. */
  on: boolean;
  testId: string;
}) {
  const words = String(options.find((o) => o.value === value)?.label ?? "");
  return (
    <PullDown
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      align="start"
      trigger={
        <button type="button" aria-label={`${label}: ${words}`} data-testid={testId} data-pressed={on ? "" : undefined} className={TILE}>
          <Face icon={icon} label={label} value={words} menu />
        </button>
      }
    />
  );
}
