import { useId } from "react";
import { CircleDashed, CloudSun, Plane, Shield } from "lucide-react";
import { LayerSubmenu, LayerToggle, LayerToggleMenu } from "../../components/LayerTile";
import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import SectionTitle from "../../components/SectionTitle";
import { usePreferences } from "../../lib/preferences";
import { useWeatherLayers, type WindsAt } from "../../lib/map/sources/weatherLayers";
import { WINDS_MODELLED_LABEL } from "../../lib/windsAloft";
import { LoopMenu } from "../weather-loop";
import { FlowMenu } from "../weather-flow";

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
 * What the map draws over the chart, four layers as the Map card's tiles
 * (LayerTile), each on or off and kept in the preferences (the owner,
 * 2026-11-14: "I want to keep it simple though. can we just have four
 * layers aeronautical, weather, traffic, private/military in the map
 * settings?"), where there were eleven; two by two since 2026-11-14. The public fields, the route and
 * the plan's points, own ship and the TFRs have no switch: always drawn;
 * the route's checkpoints and the Class B chips are the route's ••• menu's
 * (ShowRouteAs). Which weather the Weather layer draws is its tile's own
 * menu, the ••• in its corner.
 */
export default function MapLayers() {
  const prefs = usePreferences();
  const id = useId();
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col">
      <div className="pb-1.5">
        <SectionTitle id={id}>Layers</SectionTitle>
      </div>
      {/* Two by two, each row as tall as the other (auto-rows-fr). */}
      <div className="grid auto-rows-fr grid-cols-2 gap-2">
        {/* The Class B, C and D and special-use airspace (AirspaceGl), and
            the VORs, fixes and VFR waypoints (NavaidsGl): on unless turned off. */}
        <LayerToggle
          name="Aeronautical"
          glyph={CircleDashed}
          on={prefs.aeronautical}
          onChange={prefs.setAeronautical}
          testId="aeronautical-toggle"
        />
        {/* The fields' weather marks (Settings' Airport Weather says how)
            and the weather picked in its menu: on unless turned off. */}
        <LayerToggleMenu
          name="Weather"
          glyph={CloudSun}
          on={prefs.weather}
          onChange={prefs.setWeather}
          testId="weather-toggle"
          menuLabel="Weather to show"
          menuTestId="weather-more"
        >
          <WeatherPicks />
        </LayerToggleMenu>
        {/* The airplanes ADS-B receivers hear about the map (TrafficGl),
            from adsb.lol: off unless turned on, as it asks a third party
            every five seconds. */}
        <LayerToggle name="Traffic" glyph={Plane} on={prefs.traffic} onChange={prefs.setTraffic} testId="traffic-toggle" />
        {/* The privately owned fields and the armed services' own: off by
            default, as each is landed at only by leave; drawn whatever
            this says while the emergency assistant is open. */}
        <LayerToggle
          // The words only; the preference is still privateMilitary.
          name="Private & Military"
          glyph={Shield}
          on={prefs.privateMilitary}
          onChange={prefs.setPrivateMilitary}
          testId="private-military-toggle"
        />
      </div>
    </section>
  );
}

/** Which weather the Weather layer draws, each as it was picked before
 *  the four layers and at its own default: the SIGMETs and G-AIRMETs and
 *  the pilot reports, each on or off (off by default, as an area hundreds
 *  of miles across takes the tap meant for what is under it), and as
 *  submenus the winds aloft at an altitude (discrete altitudes, not a
 *  slider; the GFS's, lib/windsAloft), the radar and satellite loop
 *  (features/weather-loop) and the model weather (features/weather-flow). */
function WeatherPicks() {
  const { areas, pireps, winds, set } = useWeatherLayers();
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Weather</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={areas} onCheckedChange={(on) => set({ areas: on })} data-testid="weather-areas-toggle">
          AIRMETs and SIGMETs
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={pireps} onCheckedChange={(on) => set({ pireps: on })} data-testid="weather-pireps-toggle">
          PIREPs
        </DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <LayerSubmenu
        name="Winds Aloft"
        testId="weather-winds"
        pick={{
          heading: "Winds Aloft",
          note: WINDS_MODELLED_LABEL,
          value: winds,
          choices: WINDS,
          onPick: (v) => set({ winds: v }),
          testId: "weather-winds",
        }}
      />
      <LoopMenu />
      <FlowMenu />
    </>
  );
}
