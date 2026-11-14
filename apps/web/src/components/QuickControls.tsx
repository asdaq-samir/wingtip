import { Sun, SunDim, SunMedium } from "lucide-react";
import MenuTile from "./MenuTile";
import { usePreferences, type ChartLight } from "../lib/preferences";

/**
 * Sunlight, the one tile left of Settings' old Look group (features/settings;
 * the owner's option A, 2026-11-13): a round mark filled in the tint while
 * on, its name, its setting under it, a tap its menu, as Apple Maps' voice
 * is. Theme and Appearance, the other two, moved to the Map card's Look
 * section on 2026-11-14 (the owner: "move the look to map settings too");
 * they are drawn there and on the first flight's welcome (lookPicks).
 */
export default function QuickControls() {
  const chartLight = usePreferences((s) => s.chartLight);
  const setChartLight = usePreferences((s) => s.setChartLight);
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
      </div>
    </>
  );
}
