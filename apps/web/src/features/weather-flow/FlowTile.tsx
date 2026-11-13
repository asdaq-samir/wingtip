import { Waves } from "lucide-react";
import { LayerMenu } from "../../components/LayerTile";
import { useWeatherLayers, type FlowField } from "../../lib/map/sources/weatherLayers";
import { FIELDS } from "./flowLook";

const CHOICES: { value: FlowField; label: string }[] = [{ value: "off", label: "Off" }, ...FIELDS];

/**
 * The flow layer's tile among the Map card's layers (features/map-settings),
 * beside the radar loop's: Off, or the field drawn under the wind's
 * streaks (the owner, 2026-11-11: Windy's map, then "Or even weather like
 * gfs"; 2026-11-12, from the Aviation Weather Center where it publishes
 * the field), whose it is under the menu's heading. Off by default, so it
 * never fights the sectional; a menu, as discrete settings are here, not
 * a slider. The legend on the map has the same menu.
 */
export function FlowTile() {
  const flow = useWeatherLayers((s) => s.flow);
  const set = useWeatherLayers((s) => s.set);
  return (
    <LayerMenu<FlowField>
      name="Model Weather"
      glyph={Waves}
      testId="weather-flow"
      off="off"
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
