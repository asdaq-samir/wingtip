import { ListRow } from "../../components/GroupedList";
import MenuPick from "../../components/MenuPick";
import { useWeatherLayers, type FlowField } from "../../lib/map/sources/weatherLayers";
import { FIELDS } from "./flowLook";

const CHOICES: { value: FlowField; label: string }[] = [{ value: "off", label: "Off" }, ...FIELDS];

/**
 * The flow layer's menu in the Map menu's Weather group, beside the radar
 * loop's: Off, or the field drawn under the wind's streaks (the owner,
 * 2026-11-11: Windy's map, then "Or even weather like gfs"; 2026-11-12,
 * from the Aviation Weather Center where it publishes the field). Off by
 * default, so it never fights the sectional; a menu, as discrete settings
 * are here, not a slider. The legend on the map has the same menu.
 */
export function FlowSettingsRow() {
  const flow = useWeatherLayers((s) => s.flow);
  const set = useWeatherLayers((s) => s.set);
  return (
    <ListRow title="Model Weather" description="Aviation Weather Center winds, clouds, icing and turbulence">
      <MenuPick name="Model weather" value={flow} choices={CHOICES} onPick={(v) => set({ flow: v })} testId="weather-flow" />
    </ListRow>
  );
}
