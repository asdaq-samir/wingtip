import { Sun, SunDim, SunMedium } from "lucide-react";
import MenuTile from "./MenuTile";
import { usePreferences, type ChartLight } from "../lib/preferences";
import { AppearanceTile, ThemeTile } from "./lookPicks";

/**
 * The app's look, three big tiles, as iOS's Control Center lays its out:
 * Settings' Look group (features/settings; the owner's option A,
 * 2026-11-13), where they were Setup's Layout on the avatar's card. Each
 * a round mark filled in the tint while on, its name, and its setting
 * under it; a tap its menu, as Apple Maps' voice is -- not a cycle a pilot
 * cannot foresee. Sunlight took FPL's place on 2026-11-13, and Appearance
 * took in the map settings' Chart at Night as a fourth pick, Dark +
 * Bright; Position, the sheet at the top or the bottom, went the same day
 * (the sheet is always at a phone's foot).
 */
export default function QuickControls() {
  const chartLight = usePreferences((s) => s.chartLight);
  const setChartLight = usePreferences((s) => s.setChartLight);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 [&>:last-child:nth-child(odd)]:col-span-2" data-testid="quick-controls">
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
