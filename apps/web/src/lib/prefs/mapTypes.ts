import type { Filters, FilterKey } from "../pointFilters";
import type { StopPick } from "../stopKinds";
import type { ChartDim } from "../map/chartLook";

/** The base chart: none, the sectional, or an IFR enroute chart. None
 *  draws no FAA chart, only the overlay picked, if any, over the plain
 *  ground (BaseGl's PlainGround), with the airports, the airspace, the
 *  navaids, the route, the weather and the traffic over it as ever (the
 *  owner, 2026-11-14: "chart should also have none option"). */
export type BaseChart = "none" | "sec" | "ifr_low" | "ifr_high";

/** What is drawn over the chart, at the pilot's ask (OverlayTiles): the
 *  USGS's aerial imagery, Google's map or its satellite imagery, or none. */
export type MapOverlay = "none" | "usgs" | "google-map" | "google-satellite";
/** How strongly the overlay covers the chart. */
export type OverlayStrength = "faint" | "half" | "full";

/** The chart in bright sunlight (lib/sunlight): its tiles at higher
 *  contrast, the course and the sheets solid white with black figures.
 *  Auto turns it on from the phone's light sensor where the browser has
 *  one; On and Off are the pilot's own. */
export type ChartLight = "auto" | "on" | "off";

/** How many times the 3D view stands every height up: the ground, the
 *  airspace, the route in the air, the obstacles and the traffic, all by
 *  the one factor, so each keeps its true place against the others. A
 *  display factor, not an aviation figure: at true scale Chicago's Class
 *  B is some 55 km across and 3 km tall, so its shelves are slivers, and
 *  stretched three times the upside-down wedding cake reads (the owner,
 *  2026-11-14). The words on the map keep the true altitudes. */
export type HeightStretch = 1 | 3 | 5;

/** Hazard colouring (the Map card's): the ground and the obstacles
 *  coloured against the altitude flown, never, always, or by itself in
 *  flight; the engine's hazard_view says when and against what. */
export type HazardSetting = "off" | "on" | "flight";

/** What the map draws and how: the Map card's and Settings' Map group. */
export interface MapSlice {
  base: BaseChart;
  /** The Map card's four layers (the owner, 2026-11-14: "I want to keep
   *  it simple though. can we just have four layers aeronautical,
   *  weather, traffic, private/military in the map settings?"), where
   *  there were eleven tiles. Always drawn, with no switch: the public
   *  fields, the route and the plan's points, own ship, and the TFRs, a
   *  hazard a pilot must know of near the route (14 CFR 91.103).
   *
   *  Aeronautical: the Class B, C and D and the special-use airspace
   *  (AirspaceGl), and the VORs, fixes and VFR waypoints (NavaidsGl). On
   *  by default, as the airspace and the VORs were. */
  aeronautical: boolean;
  /** Weather: the fields' weather marks (Settings' Airport Weather says
   *  how) and whatever weather the pilot picked in its tile's menu -- the
   *  AIRMETs and SIGMETs, the PIREPs, the winds aloft, the radar loop, the
   *  model weather. On by default, as the fields' weather marks were. */
  weather: boolean;
  /** Whether the route has its VFR checkpoints, at every zoom: the
   *  planner's checkpoints and the landmarks they were chosen from, the
   *  training map's detections and added points. Off unless turned on, at
   *  the owner's ask ("Let's not enable waypoints for a pilot"); the
   *  Map card's Route Checkpoints switch (MapLayers). */
  waypoints: boolean;
  /** Whether the airplanes ADS-B receivers hear about the map are drawn
   *  (TrafficGl). Off by default: it asks a third party every five seconds. */
  traffic: boolean;
  /** Whether a picked approach's plate is laid on the chart (PlatesGl).
   *  On by default; the procedure's own menu, not the Map card. */
  plates: boolean;
  /** Private/Military: the privately owned fields (NASR APT_BASE's
   *  facility use, PR) and those the armed services own, which a pilot
   *  lands at only by leave. Off by default; drawn whatever this says
   *  while the emergency assistant is open (overlayFilters), and a field
   *  on the route or picked either way. Joint-use fields always are. */
  privateMilitary: boolean;
  /** What is drawn over the chart (OverlayTiles), and how strongly: kept,
   *  as every other map choice is, where a reload lost it (WEB-15). */
  overlay: MapOverlay;
  overlayStrength: OverlayStrength;
  /** Whether each route loaded keeps its charts for use without a
   *  connection (keepRoute). Off by default, as it downloads. */
  keepOffline: boolean;
  /** The training map's filters: which points are drawn and walked. */
  filters: Filters;
  /** How far the chart's tiles are dimmed (lib/map/chartLook), one for
   *  each appearance, the Map card's Dimmer setting the one drawn: none
   *  in the light theme and the night's half in the dark unless moved. */
  chartDim: ChartDim;
  /** The Map card's Contrast: an offset on the chart's own contrast by
   *  day, at night or in sunlight, 0 that look as it is (chartContrast). */
  chartContrast: number;
  /** The chart in sunlight (lib/sunlight): from the light sensor, on, or off. */
  chartLight: ChartLight;
  /** The map stood up in 3D, the map's 3D button (ThreeDButton). */
  threeD: boolean;
  /** The map's words grown with the pilot's text size, at most 1.2x (the
   *  Map card's Larger Map Labels; the owner, 2026-11-21): off, they are
   *  their own px, as Apple Maps keeps them. */
  largerMapLabels: boolean;
  /** How many times 3D stands its heights up (HeightStretch): three
   *  unless picked, the Map card's Heights while 3D is on. */
  heightStretch: HeightStretch;
  /** Hazard colouring: off unless picked (HazardSetting). */
  hazard: HazardSetting;
  /** The pilot's clearance for its red, ft: one of the engine's
   *  clearances_ft (500, 1,000, 2,000); null, none picked, the engine's
   *  default. */
  hazardClearanceFt: number | null;
  /** How far round the pilot the map's Stops look, nm: 25 unless picked
   *  (the owner, 2026-10-27; StopsCard's menu). */
  stopsRadiusNm: number;
  /** The kind of stop last picked on the Stops sheet, or all of them. */
  stopKind: StopPick;
  setBase: (base: BaseChart) => void;
  setAeronautical: (aeronautical: boolean) => void;
  setWeather: (weather: boolean) => void;
  setWaypoints: (waypoints: boolean) => void;
  setTraffic: (traffic: boolean) => void;
  setPlates: (plates: boolean) => void;
  setPrivateMilitary: (privateMilitary: boolean) => void;
  setOverlay: (overlay: MapOverlay) => void;
  setOverlayStrength: (overlayStrength: OverlayStrength) => void;
  setKeepOffline: (keepOffline: boolean) => void;
  setFilter: (key: FilterKey, on: boolean) => void;
  setChartDim: (appearance: keyof ChartDim, dim: number) => void;
  setChartContrast: (chartContrast: number) => void;
  setChartLight: (chartLight: ChartLight) => void;
  setThreeD: (threeD: boolean) => void;
  setLargerMapLabels: (largerMapLabels: boolean) => void;
  setHeightStretch: (heightStretch: HeightStretch) => void;
  setHazard: (hazard: HazardSetting) => void;
  setHazardClearanceFt: (ft: number | null) => void;
  setStopsRadiusNm: (nm: number) => void;
  setStopKind: (kind: StopPick) => void;
}
