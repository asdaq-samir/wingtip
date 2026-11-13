import { useId } from "react";
import {
  Ban,
  CircleDashed,
  CloudAlert,
  CloudSun,
  Flag,
  Grid2x2,
  Hexagon,
  Lock,
  MessageSquareText,
  Plane,
  Shield,
  Wind,
} from "lucide-react";
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
 * What the map draws over the chart, as the Map card's tiles (LayerTile;
 * the owner's pick, option A of the map settings canvas, 2026-11-13),
 * where they were a list of switches and menus: the chart's own marks,
 * the traffic, the weather (WeatherGl, and the loop's WeatherLoopGl and
 * the flow layer) and the fields. Each kept as it was: the map's in the
 * preferences, the weather's on this device (lib/map/sources/weatherLayers).
 */
export default function MapLayers() {
  const prefs = usePreferences();
  const { areas, pireps, winds, set } = useWeatherLayers();
  const id = useId();
  const sec = prefs.base === "sec";
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col">
      <div className="pb-1.5">
        <SectionTitle id={id}>Layers</SectionTitle>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {/* The Class B, C and D's lines and altitudes over the chart
            (AirspaceGl), and the VORs and enroute fixes (NavaidsGl):
            on unless turned off, the owner's pick of the map's looks. */}
        <LayerToggle name="Airspace" glyph={CircleDashed} on={prefs.airspace} onChange={prefs.setAirspace} testId="airspace-toggle" />
        {/* The temporary flight restrictions, from tfr.faa.gov: on unless
            turned off, as a pilot must know of every one near the route
            (14 CFR 91.103). */}
        <LayerToggle name="TFRs" glyph={Ban} on={prefs.tfrs} onChange={prefs.setTfrs} testId="tfrs-toggle" />
        {/* The route's VFR checkpoints, on either map: the planner's
            numbered checkpoints at every zoom and the dim landmarks they
            were chosen from closer in; off, the course line and its two
            airports alone. */}
        <LayerToggle name="VFR Checkpoints" glyph={Flag} on={prefs.waypoints} onChange={prefs.setWaypoints} testId="waypoints-toggle" />
        <LayerToggle name="VORs and Fixes" glyph={Hexagon} on={prefs.navaids} onChange={prefs.setNavaids} testId="navaids-toggle" />
        {/* The airplanes ADS-B receivers hear about the map (TrafficGl),
            from adsb.lol: off unless turned on, as it asks a third party
            every five seconds. Setup's Controls has it too, for the
            cockpit, as iOS has Wi-Fi in Control Center and Settings. */}
        <LayerToggle name="Traffic" glyph={Plane} on={prefs.traffic} onChange={prefs.setTraffic} testId="traffic-toggle" />
        {/* The SIGMETs and G-AIRMETs and the pilot reports, each on or off:
            a tile whose state reads at a glance, as the stock switch's did
            where a "Show" pill looked the same on and off (the UI audit,
            2026-11-09). */}
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
        {/* The winds aloft at an altitude picked from a menu (discrete
            altitudes, not a slider); whose winds the barbs draw, the
            GFS's (lib/windsAloft), under the menu's heading. */}
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
        {/* The radar and satellite loop and its speed (features/weather-loop),
            and the model weather under the wind's streaks (features/weather-flow). */}
        <LoopTile />
        <FlowTile />
        {/* The Class B airports' weather now, as chips on the map, and
            the terminal sheet over the base wherever there is one: the
            TAC over the sectional, the IFR area chart over the IFR
            charts. A chip's card pins its field's sheet either way. */}
        <LayerToggle name="Class B Weather" glyph={CloudSun} on={prefs.classB} onChange={prefs.setClassB} testId="class-b-toggle" />
        <LayerToggle
          name={sec ? "Terminal Area Charts" : "IFR Area Charts"}
          glyph={Grid2x2}
          on={prefs.tac}
          onChange={prefs.setTac}
          testId="tac-toggle"
        />
        {/* The privately owned fields (the owner, 2026-10-27): off by
            default, as a field landed at only by its owner's leave, on to
            see them. */}
        <LayerToggle
          name="Private Fields"
          glyph={Lock}
          on={prefs.privateFields}
          onChange={prefs.setPrivateFields}
          testId="private-toggle"
        />
        {/* The fields the armed services own and keep to themselves: off by
            default, as most pilots may not land there without the
            service's permission. A joint-use field is drawn either way. */}
        <LayerToggle name="Military Fields" glyph={Shield} on={prefs.military} onChange={prefs.setMilitary} testId="military-toggle" />
      </div>
    </section>
  );
}
