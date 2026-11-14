import { LayerPickGroup, LayerSubmenu, type LayerPick } from "../../components/LayerTile";
import { DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
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
 * The loop's submenu in the Map card's Weather menu (features/map-settings,
 * since the four layers, the owner, 2026-11-14), where it was a tile of
 * its own: which loop, and, with one on, how fast it plays. Menus, as
 * discrete settings are here, not sliders. Off by default.
 */
export function LoopMenu() {
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
    <LayerSubmenu name="Radar" testId="weather-loop" pick={kind}>
      {loop !== "off" && (
        <>
          <DropdownMenuSeparator />
          <LayerPickGroup pick={pace} />
        </>
      )}
    </LayerSubmenu>
  );
}
