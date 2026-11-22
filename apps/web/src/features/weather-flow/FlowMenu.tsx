import { useEffect } from "react";
import { LayerSubmenu } from "../../components/LayerTile";
import { prefetchFlowGl } from "./flowChunk";
import { useExtra } from "../../lib/extras";
import { useWeatherLayers, type FlowField } from "../../lib/map/sources/weatherLayers";
import { FIELDS } from "./flowLook";

const CHOICES: { value: FlowField; label: string }[] = [{ value: "off", label: "Off" }, ...FIELDS];

/**
 * The flow layer's submenu in the Map card's Weather menu (features/map-settings,
 * since the four layers, the owner, 2026-11-14), beside the radar loop's:
 * Off, or the field drawn under the wind's streaks (the owner, 2026-11-11:
 * Windy's map, then "Or even weather like gfs"; 2026-11-12, from the
 * Aviation Weather Center where it publishes the field), whose it is under
 * the heading. Off by default, so it never fights the sectional; a menu,
 * as discrete settings are here, not a slider. The legend on the map has
 * the same menu. Not offered while Model Weather is parked (Settings'
 * Extras, lib/extras).
 */
export function FlowMenu() {
  const flow = useWeatherLayers((s) => s.flow);
  const set = useWeatherLayers((s) => s.set);
  const offered = useExtra("modelWeather");
  // Drawn as the Weather menu opens: the layer's chunk asked for then, ahead
  // of a field being picked in it; nothing while Model Weather is parked.
  useEffect(() => {
    if (offered) prefetchFlowGl();
  }, [offered]);
  if (!offered) return null;
  return (
    <LayerSubmenu<FlowField>
      name="Model Weather"
      testId="weather-flow"
      pick={{
        heading: "Model Weather",
        note: "Aviation Weather Center winds, clouds, icing and turbulence",
        value: flow,
        choices: CHOICES,
        onPick: (v) => set({ flow: v }),
        testId: "weather-flow",
      }}
    />
  );
}
