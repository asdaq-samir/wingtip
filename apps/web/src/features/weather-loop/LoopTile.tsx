import { Radar } from "lucide-react";
import { LayerMenu, LayerPickGroup, type LayerPick } from "../../components/LayerTile";
import { useWeatherLayers, type LoopKind, type LoopSpeed } from "../../lib/map/sources/weatherLayers";
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
 * The loop's tile among the Map card's layers (features/map-settings),
 * where its two menu rows were: a tap is one menu of which loop, and,
 * with one on, how fast it plays. Menus, as discrete settings are here,
 * not sliders.
 */
export function LoopTile() {
  const loop = useWeatherLayers((s) => s.loop);
  const speed = useWeatherLayers((s) => s.loopSpeed);
  const set = useWeatherLayers((s) => s.set);
  const kind: LayerPick<LoopKind> = {
    heading: "Radar and Satellite",
    value: loop,
    choices: KINDS,
    onPick: (v) => set({ loop: v }),
    testId: "weather-loop",
  };
  const pace: LayerPick<LoopSpeed> = {
    heading: "Loop Speed",
    value: speed,
    choices: SPEEDS,
    onPick: (v) => set({ loopSpeed: v }),
    testId: "weather-loop-speed",
    groupTestId: "weather-loop-speed",
  };
  return (
    <LayerMenu
      name="Radar"
      glyph={Radar}
      testId="weather-loop"
      off="off"
      pick={kind}
      more={loop !== "off" && <LayerPickGroup pick={pace} />}
    />
  );
}
