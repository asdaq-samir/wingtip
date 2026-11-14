import { planner, data } from "./http";
import type {
  AircraftBases,
  AircraftRegistration,
  AirspaceAt,
  WeatherLoop,
  WeatherMap,
  AlertsAhead,
  ChartInfo,
  ClassBResponse,
  FlightDetail,
  FlightRoute,
  FlightStatus,
  GoogleMaps,
  MapLayerAges,
  OverlayTiles,
  Obstacles,
  PastFlight,
  PastFlights,
  Tfrs,
  Traffic,
  TrafficFound,
  AirportAtis,
  AirportRvr,
  CopilotAround,
  DepartureEvents,
  FlowAtAirports,
  ItwsAlerts,
  SaaStatuses,
} from "./types";

/** The planner's calls for what the map draws (./client's `api`): the chart,
 *  the airspace, the weather, the live feeds and the traffic. */
export const plannerMap = {
  /** Every Class B airport, with its current weather and the terminal
   *  chart covering it. One call for all thirty rather than one per
   *  marker on hover: the planner has the airspace and both national
   *  weather caches in memory already. */
  classB: () =>
    planner
      .GET("/api/class-b")
      .then(data<ClassBResponse>)
      .then((r) => r.airports),
  tfrs: () =>
    planner
      .GET("/api/tfrs")
      .then(data<Tfrs>)
      .then((r) => r.tfrs),
  /** When the planner fetched the METARs and TFRs the map draws. */
  mapAges: () => planner.GET("/api/map/ages").then(data<MapLayerAges>),
  /** The chart the map draws, for a map with no route on it yet. */
  chart: () => planner.GET("/api/chart").then(data<ChartInfo>),
  /** The airspace over a point, from the ground up: the classes in
   *  bands with their minimums, the Mode C veil, special use and TFRs. */
  airspaceAt: (lat: number, lon: number) => planner.GET("/api/airspace/at", { params: { query: { lat, lon } } }).then(data<AirspaceAt>),

  /** The weather the map draws in a box (vfr.weather_map): the SIGMETs and
   *  G-AIRMETs, the PIREPs, the winds aloft at `altitudeFt`, and when the
   *  radar was made; at `at` (UNIX seconds), now when none. */
  weatherMap: (box: { south: number; west: number; north: number; east: number }, altitudeFt: number | null, at?: number) =>
    planner.GET("/api/weather/map", { params: { query: { ...box, altitude_ft: altitudeFt ?? undefined, at } } }).then(data<WeatherMap>),

  /** The radar or satellite loop's frames (wingtip.weather_loop), oldest
   *  first, each with its tile templates. */
  weatherLoop: (kind: "radar" | "ir" | "visible" | "both") =>
    planner.GET("/api/weather/loop", { params: { query: { kind } } }).then(data<WeatherLoop>),

  /** What is ahead of own ship in the air (lib/map/position/ahead): airspace,
   *  special-use areas and TFRs its track goes into, the ground and
   *  obstacles it comes near. */
  airspaceAhead: (ask: { lat: number; lon: number; track: number; gs: number; alt?: number; vs: number }) =>
    planner.GET("/api/airspace/ahead", { params: { query: ask } }).then(data<AlertsAhead>),

  /** What the FAA's SWIM feeds say now (lib/liveReports): the ITWS alerts
   *  at airports, special activity airspace's status, an airport's RVR
   *  and D-ATIS, the Command Center's programs, a flight's departure. */
  liveItws: (airports: string[]) =>
    planner.GET("/api/live/itws", { params: { query: { airports: airports.join(",") } } }).then(data<ItwsAlerts>),
  liveSaa: (designators: string[]) =>
    planner.GET("/api/live/saa", { params: { query: { designators: designators.join(",") } } }).then(data<SaaStatuses>),
  liveRvr: (airport: string) => planner.GET("/api/live/rvr", { params: { query: { airport } } }).then(data<AirportRvr>),
  liveAtis: (airport: string) => planner.GET("/api/live/atis", { params: { query: { airport } } }).then(data<AirportAtis>),
  liveFlow: (airports: string[]) =>
    planner.GET("/api/live/flow", { params: { query: { airports: airports.join(",") } } }).then(data<FlowAtAirports>),
  liveDepartures: (ident: string) => planner.GET("/api/live/departures", { params: { query: { ident } } }).then(data<DepartureEvents>),

  /** What the in-flight copilot reads (features/copilot): the fields round
   *  the airplane with their METARs, the areas on the rest of the route
   *  ("lat,lon;..."), ITWS's alerts at the destination and alternate. */
  copilotAround: (ask: { lat: number; lon: number; dest: string; alternate?: string; path: string }) =>
    planner.GET("/api/copilot/around", { params: { query: ask } }).then(data<CopilotAround>),

  /** The airplanes ADS-B receivers hear within `radius` nm of a point,
   *  from adsb.lol's open data (TrafficGl). */
  traffic: (ask: { lat: number; lon: number; radius: number }) =>
    planner.GET("/api/traffic", { params: { query: ask } }).then(data<Traffic>),

  /** Where airplanes are based, the field their last flights keep to; the
   *  ones still being looked up pending (the Aircraft tab's "based at"). */
  trafficBased: (hexes: string[]) =>
    planner.GET("/api/traffic/based", { params: { query: { hex: hexes.join(",") } } }).then(data<AircraftBases>),

  /** The airplanes in the air a pilot names, by callsign, registration or
   *  ICAO address, to track one (AircraftCard); with none in the air, the
   *  FAA's record of the one named, to open its card all the same. */
  trafficFind: (q: string) => planner.GET("/api/traffic/find", { params: { query: { q } } }).then(data<TrafficFound>),

  /** The FAA's record of a US airplane by its N-number or ICAO address,
   *  null for any other name: off the planner's disk, at once, where the
   *  find waits on the live sources (lib/airplane/lookup). */
  trafficRegistered: (q: string) =>
    planner.GET("/api/traffic/registered", { params: { query: { q } } }).then(data<AircraftRegistration | null>),

  /** A tracked flight's airplane, where it took off and its path today,
   *  and a US airplane's FAA registration. */
  /** An airplane's flights of the last seven days, newest first. */
  /** Its last ten flights found, or those before a day (`until`) and a
   *  takeoff (`before`, the last listed): the list's next page. */
  trafficHistory: (hex: string, from?: { until?: string; before?: number }) =>
    planner
      .GET("/api/traffic/flight/{hex_id}/history", {
        params: { path: { hex_id: hex }, query: { until: from?.until, before: from?.before } },
      })
      .then(data<PastFlights>),
  /** One of them, its reports, for its track log and its replay. */
  trafficPastFlight: (hex: string, id: number) =>
    planner
      .GET("/api/traffic/flight/{hex_id}/history/{flight_id}", { params: { path: { hex_id: hex, flight_id: id } } })
      .then(data<PastFlight>),
  trafficFlight: (hex: string) =>
    planner.GET("/api/traffic/flight/{hex_id}", { params: { path: { hex_id: hex } } }).then(data<FlightDetail>),
  /** Its state now, seconds old, for the alerts a pilot sets on it: in
   *  the air or not, where, and the field it left or has landed at. */
  trafficStatus: (hex: string) =>
    planner.GET("/api/traffic/flight/{hex_id}/status", { params: { path: { hex_id: hex } } }).then(data<FlightStatus>),

  /** The deployment's key for Google's map tiles; a 404 where it has
   *  none (OverlayTiles). */
  googleMaps: () => planner.GET("/api/map/google").then(data<GoogleMaps>),
  /** The FAA's obstacles in a box, at least 200 ft tall, tallest first:
   *  what the tilted map stands up over its ground (TerrainGl). */
  obstacles: (box: { south: number; west: number; north: number; east: number }) =>
    planner.GET("/api/terrain/obstacles", { params: { query: box } }).then(data<Obstacles>),

  /** The route a flight number is scheduled to fly, and whether the
   *  airplane where it is now is on it; null for none known. */
  trafficRoute: (ask: { callsign: string; lat?: number; lon?: number }) =>
    planner.GET("/api/traffic/route", { params: { query: ask } }).then(data<FlightRoute | null>),

  /** The cycle's overlay tiles -- airspace, special use, airports, navaids
   *  and fixes as one PMTiles archive -- by name, zooms and layers, for a
   *  MapLibre map's source (lib/map/sources/overlayTiles). */
  overlayTiles: () => planner.GET("/api/overlay-tiles").then(data<OverlayTiles>),
};
