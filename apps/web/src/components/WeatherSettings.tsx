import { ListGroup, ListRow } from "./GroupedList";
import SwitchRow from "./SwitchRow";
import MenuPick from "./MenuPick";
import { useWeatherLayers, type WindsAt } from "../lib/map/sources/weatherLayers";
import { LoopSettingsRows } from "../features/weather-loop";
import { FlowSettingsRow } from "../features/weather-flow";
import { WINDS_MODELLED_LABEL } from "../lib/windsAloft";

/** The winds aloft's altitudes: the plan's cruise, or one of the FD
 *  product's own, written FL and hundreds of feet as the map's weather
 *  writes every altitude, the owner's pick (lib/format mapLevel). */
const WINDS: { value: WindsAt; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "plan", label: "The plan's" },
  { value: 3000, label: "FL030" },
  { value: 6000, label: "FL060" },
  { value: 9000, label: "FL090" },
  { value: 12000, label: "FL120" },
  { value: 18000, label: "FL180" },
];

/**
 * The weather the map draws (WeatherGl, and the loop's WeatherLoopGl),
 * in the map's own button's card right after the charts' pictures, as
 * Apple Maps' Choose Map card has its maps first (the owner's screenshot,
 * 2026-11-10; before it, first of all, at the owner's pick of the
 * canvas's map weather, A: "A layers button on the map"): the radar and
 * satellite loop and its speed (features/weather-loop), the SIGMETs and
 * G-AIRMETs, the pilot reports, each on or off, and the winds aloft at an
 * altitude picked from a menu (discrete altitudes, not a slider). Kept on
 * this device (lib/map/sources/weatherLayers).
 */
export default function WeatherSettings() {
  const { areas, pireps, winds, set } = useWeatherLayers();
  return (
    <ListGroup title="Weather">
      <LoopSettingsRows />
      <FlowSettingsRow />
      {/* The stock switch, whose state reads at a glance: a "Show" pill
          looked the same on and off (the UI audit, 2026-11-09). */}
      <SwitchRow title="AIRMETs and SIGMETs" on={areas} onChange={(on) => set({ areas: on })} testId="weather-areas-toggle" />
      <SwitchRow title="PIREPs" on={pireps} onChange={(on) => set({ pireps: on })} testId="weather-pireps-toggle" />
      {/* Whose winds the barbs draw, under the row's title: the GFS's (lib/windsAloft). */}
      <ListRow title="Winds aloft" description={WINDS_MODELLED_LABEL}>
        <MenuPick name="Winds aloft" value={winds} choices={WINDS} onPick={(v) => set({ winds: v })} testId="weather-winds" />
      </ListRow>
    </ListGroup>
  );
}
