import { PanelBottom, PanelTop, Sun, SunDim, SunMedium } from "lucide-react";
import MenuTile from "./MenuTile";
import { usePreferences, type ChartLight, type NavEdge } from "../lib/preferences";
import { AppearanceTile, ThemeTile } from "./lookPicks";
import { useNavEdge } from "../hooks/use-nav-edge";

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
  const setNavBar = usePreferences((s) => s.setNavBar);
  const chartLight = usePreferences((s) => s.chartLight);
  const setChartLight = usePreferences((s) => s.setChartLight);
  const edge = useNavEdge();
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
        {/* Shared with the first flight's welcome (lookPicks). */}
        <ThemeTile />
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
          folded in (the owner, 2026-11-13; lookPicks' APPEARANCES). */}
        <AppearanceTile />
      </div>
    </>
  );
}
