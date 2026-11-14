import { useId } from "react";
import { CircleDashed, CloudAlert, CloudSun, MessageSquareText, Plane, Shield, Wind } from "lucide-react";
import { LayerMenu, LayerToggle } from "../../components/LayerTile";
import SectionTitle from "../../components/SectionTitle";
import { usePreferences } from "../../lib/preferences";
import { useWeatherLayers, type WindsAt } from "../../lib/map/sources/weatherLayers";
import { WINDS_MODELLED_LABEL } from "../../lib/windsAloft";
import { LoopTile } from "../weather-loop";
import { FlowTile } from "../weather-flow";

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
 * settings?"), where there were eleven. The public fields, the route and
 * the plan's points, own ship and the TFRs have no switch: always drawn.
 * Under them, while Weather is on, which weather it draws -- the pilot's
 * picks as they were, kept on this device (lib/map/sources/weatherLayers)
 * -- and the fields' weather marks as Settings' Airport Weather says.
 */
export default function MapLayers() {
  const prefs = usePreferences();
  const id = useId();
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <div className="pb-1.5">
        <SectionTitle id={id}>Layers</SectionTitle>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {/* The Class B, C and D and special-use airspace (AirspaceGl), the
            VORs, fixes and VFR waypoints (NavaidsGl), and the route's VFR
            checkpoints with their landmarks: on unless turned off. */}
        <LayerToggle
          name="Aeronautical"
          glyph={CircleDashed}
          on={prefs.aeronautical}
          onChange={prefs.setAeronautical}
          testId="aeronautical-toggle"
        />
        {/* The fields' weather marks, the Class B fields' chips and the
            weather picked under it: on unless turned off. */}
        <LayerToggle name="Weather" glyph={CloudSun} on={prefs.weather} onChange={prefs.setWeather} testId="weather-toggle" />
        {/* The airplanes ADS-B receivers hear about the map (TrafficGl),
            from adsb.lol: off unless turned on, as it asks a third party
            every five seconds. */}
        <LayerToggle name="Traffic" glyph={Plane} on={prefs.traffic} onChange={prefs.setTraffic} testId="traffic-toggle" />
        {/* The privately owned fields and the armed services' own: off by
            default, as each is landed at only by leave; drawn whatever
            this says while the emergency assistant is open. */}
        <LayerToggle
          // A break after the slash, as four tiles to a row leave its
          // name too narrow a line at a phone's width.
          name={"Private/\u200bMilitary"}
          glyph={Shield}
          on={prefs.privateMilitary}
          onChange={prefs.setPrivateMilitary}
          testId="private-military-toggle"
        />
      </div>
      {prefs.weather && <WeatherPicks />}
    </section>
  );
}

/** Which weather the Weather layer draws, as it was picked before the four
 *  layers: the SIGMETs and G-AIRMETs and the pilot reports, each on or
 *  off (off by default, as an area hundreds of miles across takes the tap
 *  meant for what is under it), the winds aloft at an altitude from a menu
 *  (discrete altitudes, not a slider; the GFS's, lib/windsAloft), the radar
 *  and satellite loop (features/weather-loop) and the model weather
 *  (features/weather-flow). */
function WeatherPicks() {
  const { areas, pireps, winds, set } = useWeatherLayers();
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="weather-picks">
      <LayerToggle
        name="AIRMETs and SIGMETs"
        glyph={CloudAlert}
        on={areas}
        onChange={(on) => set({ areas: on })}
        testId="weather-areas-toggle"
      />
      <LayerToggle
        name="PIREPs"
        glyph={MessageSquareText}
        on={pireps}
        onChange={(on) => set({ pireps: on })}
        testId="weather-pireps-toggle"
      />
      <LayerMenu
        name="Winds Aloft"
        glyph={Wind}
        testId="weather-winds"
        off="off"
        pick={{
          heading: "Winds Aloft",
          note: WINDS_MODELLED_LABEL,
          value: winds,
          choices: WINDS,
          onPick: (v) => set({ winds: v }),
          testId: "weather-winds",
        }}
      />
      <LoopTile />
      <FlowTile />
    </div>
  );
}
