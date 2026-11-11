import { ListRow } from "../../components/GroupedList";
import MenuPick from "../../components/MenuPick";
import { useWeatherLayers, type LoopKind } from "../../lib/map/sources/weatherLayers";
import { SPEEDS } from "./loopFrames";

/** The loop's five, as the owner listed them (2026-11-09). */
const KINDS: { value: LoopKind; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "radar", label: "Radar" },
  { value: "ir", label: "Satellite IR" },
  { value: "visible", label: "Satellite Visible" },
  { value: "both", label: "Radar and IR" },
];

/**
 * The loop's two menus in the Map menu's Weather group, where the radar
 * and satellite switches were: which loop, and, with one on, how fast it
 * plays. Menus, as discrete settings are here, not sliders.
 */
export function LoopSettingsRows() {
  const loop = useWeatherLayers((s) => s.loop);
  const speed = useWeatherLayers((s) => s.loopSpeed);
  const set = useWeatherLayers((s) => s.set);
  return (
    <>
      <ListRow title="Radar and Satellite">
        <MenuPick name="Radar and satellite" value={loop} choices={KINDS} onPick={(v) => set({ loop: v })} testId="weather-loop" />
      </ListRow>
      {loop !== "off" && (
        <ListRow title="Loop Speed">
          <MenuPick name="Loop speed" value={speed} choices={SPEEDS} onPick={(v) => set({ loopSpeed: v })} testId="weather-loop-speed" />
        </ListRow>
      )}
    </>
  );
}
