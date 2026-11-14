import { DEFAULT_FILTERS, type FilterKey, type Filters } from "../pointFilters";
import type { StopPick } from "../stopKinds";
import type { Slice } from "./slice";

/** The base chart: the sectional, or an IFR enroute chart. */
export type BaseChart = "sec" | "ifr_low" | "ifr_high";

export const BASE_CHARTS: { kind: BaseChart; label: string }[] = [
  { kind: "sec", label: "Sectional" },
  { kind: "ifr_low", label: "IFR Low" },
  { kind: "ifr_high", label: "IFR High" },
];

/** What is drawn over the chart, at the pilot's ask (OverlayTiles): the
 *  USGS's aerial imagery, Google's map or its satellite imagery, or none. */
export type MapOverlay = "none" | "usgs" | "google-map" | "google-satellite";
/** How strongly the overlay covers the chart. */
export type OverlayStrength = "faint" | "half" | "full";

/** The FAA chart in the dark theme: as printed, or dimmed for night
 *  vision (index.css's chart-tiles); set by Setup's Appearance. */
export type ChartNight = "normal" | "dimmed";
/** The chart in bright sunlight (lib/sunlight): its tiles at higher
 *  contrast, the course and the sheets solid white with black figures.
 *  Auto turns it on from the phone's light sensor where the browser has
 *  one; On and Off are the pilot's own. */
export type ChartLight = "auto" | "on" | "off";

/** What the map draws and how: the Map card's and Settings' Map group. */
export interface MapSlice {
  base: BaseChart;
  /** Whether the terminal sheet that belongs over the base (the TAC
   *  over the sectional, the IFR area chart over an IFR chart) is
   *  pinned: drawn at every zoom it exists at. */
  tac: boolean;
  /** Whether the route has its VFR checkpoints, at every zoom: the
   *  planner's checkpoints and the landmarks they were chosen from, the
   *  training map's detections and added points. Off unless turned on, at
   *  the owner's ask ("Let's not enable waypoints for a pilot"). */
  waypoints: boolean;
  /** Whether the Class B airports are drawn, with their current flight
   *  category and a terminal chart on hover. Off by default: useful on
   *  a route that passes near one, clutter on a route that does not. */
  classB: boolean;
  /** Whether the Class B, C and D are drawn over the chart (AirspaceGl).
   *  On by default, the owner's pick of the map's looks ("C", 2026-10-29). */
  airspace: boolean;
  /** Whether the VORs are drawn over the chart, and closer in the low
   *  enroute chart's fixes (NavaidsGl). On by default, as `airspace`. */
  navaids: boolean;
  /** Whether the temporary flight restrictions are drawn (TfrGl). On
   *  by default: a pilot must know of every one near the route. */
  tfrs: boolean;
  /** Whether a picked approach's plate is laid on the chart (PlatesGl).
   *  On by default. */
  plates: boolean;
  /** Whether the airplanes ADS-B receivers hear about the map are drawn
   *  (TrafficGl). Off by default: it asks a third party every five seconds. */
  traffic: boolean;
  /** Whether the fields the armed services own are drawn (AirportsGl):
   *  off by default, as a civil airplane lands there only with the
   *  service's permission. Joint-use fields are always drawn. */
  military: boolean;
  /** Whether the privately owned fields are drawn (AirportsGl): off by
   *  default (the owner, 2026-10-27; NASR APT_BASE's facility use, PR). A
   *  field on the route or picked is drawn either way. */
  privateFields: boolean;
  /** What is drawn over the chart (OverlayTiles), and how strongly: kept,
   *  as every other map choice is, where a reload lost it (WEB-15). */
  overlay: MapOverlay;
  overlayStrength: OverlayStrength;
  /** Whether each route loaded keeps its charts for use without a
   *  connection (keepRoute). Off by default, as it downloads. */
  keepOffline: boolean;
  /** The training map's filters: which points are drawn and walked. */
  filters: Filters;
  /** The chart in the dark theme (ChartGl), dimmed unless asked for as printed. */
  chartNight: ChartNight;
  /** The chart in sunlight (lib/sunlight): from the light sensor, on, or off. */
  chartLight: ChartLight;
  /** The map stood up in 3D, the map's 3D button (ThreeDButton). */
  threeD: boolean;
  /** How far round the pilot the map's Stops look, nm: 25 unless picked
   *  (the owner, 2026-10-27; StopsCard's menu). */
  stopsRadiusNm: number;
  /** The kind of stop last picked on the Stops sheet, or all of them. */
  stopKind: StopPick;
  setBase: (base: BaseChart) => void;
  setTac: (tac: boolean) => void;
  setWaypoints: (waypoints: boolean) => void;
  setClassB: (classB: boolean) => void;
  setAirspace: (airspace: boolean) => void;
  setNavaids: (navaids: boolean) => void;
  setTfrs: (tfrs: boolean) => void;
  setPlates: (plates: boolean) => void;
  setTraffic: (traffic: boolean) => void;
  setMilitary: (military: boolean) => void;
  setPrivateFields: (privateFields: boolean) => void;
  setOverlay: (overlay: MapOverlay) => void;
  setOverlayStrength: (overlayStrength: OverlayStrength) => void;
  setKeepOffline: (keepOffline: boolean) => void;
  setFilter: (key: FilterKey, on: boolean) => void;
  setChartNight: (chartNight: ChartNight) => void;
  setChartLight: (chartLight: ChartLight) => void;
  setThreeD: (threeD: boolean) => void;
  setStopsRadiusNm: (nm: number) => void;
  setStopKind: (kind: StopPick) => void;
}

/** What of it is written to storage. */
export const MAP_KEPT = [
  "base",
  "tac",
  "waypoints",
  "classB",
  "airspace",
  "navaids",
  "tfrs",
  "plates",
  "traffic",
  "military",
  "privateFields",
  "overlay",
  "overlayStrength",
  "keepOffline",
  "filters",
  "chartNight",
  "chartLight",
  "threeD",
  "stopsRadiusNm",
  "stopKind",
] as const;

export const mapSlice: Slice<MapSlice> = (set) => ({
  base: "sec",
  tac: false,
  waypoints: false,
  classB: false,
  airspace: true,
  navaids: true,
  tfrs: true,
  plates: true,
  traffic: false,
  military: false,
  privateFields: false,
  overlay: "none",
  overlayStrength: "half",
  keepOffline: false,
  filters: DEFAULT_FILTERS,
  chartNight: "dimmed",
  chartLight: "auto",
  threeD: false,
  stopsRadiusNm: 25,
  stopKind: "all",
  setBase: (base) => set({ base }),
  setTac: (tac) => set({ tac }),
  setWaypoints: (waypoints) => set({ waypoints }),
  setClassB: (classB) => set({ classB }),
  setAirspace: (airspace) => set({ airspace }),
  setNavaids: (navaids) => set({ navaids }),
  setTfrs: (tfrs) => set({ tfrs }),
  setPlates: (plates) => set({ plates }),
  setTraffic: (traffic) => set({ traffic }),
  setMilitary: (military) => set({ military }),
  setPrivateFields: (privateFields) => set({ privateFields }),
  setOverlay: (overlay) => set({ overlay }),
  setOverlayStrength: (overlayStrength) => set({ overlayStrength }),
  setKeepOffline: (keepOffline) => set({ keepOffline }),
  setFilter: (key, on) => set((s) => ({ filters: { ...s.filters, [key]: on } })),
  setChartNight: (chartNight) => set({ chartNight }),
  setChartLight: (chartLight) => set({ chartLight }),
  setThreeD: (threeD) => set({ threeD }),
  setStopsRadiusNm: (stopsRadiusNm) => set({ stopsRadiusNm }),
  setStopKind: (stopKind) => set({ stopKind }),
});
