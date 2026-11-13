import { planner, data } from "./http";
import type {
  AirportPhotos,
  AirportPlace,
  AirportSearch,
  AirportServices,
  ForecastWind,
  AirportsInView,
  ChartPages,
  NearestAirports,
  PlacesFound,
  PlateOverlay,
  ProcedureDrawing,
  ProcedureList,
  StopFields,
  EmergencyFields,
} from "./types";

/** The airport index's shape (wingtip.airports.search_index), in its address
 *  so a day's copy in the browser of an older shape is not read as this
 *  one: 2, each field's place after its size (2026-10-22). */
const INDEX_VERSION = 2;

/** The planner's calls for airports and places (./client's `api`): the search,
 *  an airport's card and its procedures, the fields near a point or in view. */
export const plannerAirports = {
  nearestAirports: (lat: number, lon: number, limit = 10, at?: number) =>
    planner
      .GET("/api/airports/nearest", { params: { query: { lat, lon, limit, at } } })
      .then(data<NearestAirports>)
      .then((r) => r.airports),
  /** What the emergency assistant ranks (features/emergency/emergency): the fields round own ship,
   *  the wind at its altitude and the airplane's glide (its own ratio over its type's, or "own"'s alone). */
  emergencyFields: (lat: number, lon: number, altitudeFt: number | null, aircraft: string | null, glideRatio: number | null) =>
    planner
      .GET("/api/emergency/fields", {
        params: {
          query: { lat, lon, altitude_ft: altitudeFt ?? undefined, aircraft: aircraft ?? undefined, glide_ratio: glideRatio ?? undefined },
        },
      })
      .then(data<EmergencyFields>),
  /** The fields round a position with fuel, food, repair or a flight
   *  school, nearest first, for the map's Stops (StopsCard). */
  stopsNear: (lat: number, lon: number, nm: number) =>
    planner.GET("/api/stops/near", { params: { query: { lat, lon, nm } } }).then(data<StopFields>),
  /** The same along a route, in route order, while a course is drawn. */
  stopsAlong: (dep: string, dest: string, stops: string) =>
    planner.GET("/api/stops/along", { params: { query: { dep, dest, stops } } }).then(data<StopFields>),
  /** Where a place typed is -- an airport, a town, an address -- for
   *  Nearest to find the fields near it. */
  placesSearch: (q: string) =>
    planner
      .GET("/api/places/search", { params: { query: { q } } })
      .then(data<PlacesFound>)
      .then((r) => r.places),
  /** Every US airport the search answers with, for the phone to search
   *  on its own as a pilot types (lib/airportIndex): rows of ident, name,
   *  town, state, size rank and the other idents each is found by. */
  airportIndex: () =>
    // Behind what the page needs first: half a megabyte, wanted only when
    // a pilot types.
    planner
      .GET("/api/airports/index", { params: { query: { v: INDEX_VERSION } }, priority: "low" })
      .then((r) => r.data as unknown as { airports: unknown[][] }),

  /** The same answer's bytes, unread, into the browser's cache and the
   *  service worker's, where airportIndex finds them when a pilot types:
   *  the download ahead of time, the reading (a long task) only then. */
  warmAirportIndex: () =>
    planner.GET("/api/airports/index", { params: { query: { v: INDEX_VERSION } }, priority: "low", parseAs: "blob" }).then(() => true),

  /** DEP/DEST's own autocomplete -- airports whose ident or name
   *  starts with `q`. Empty `q` short-circuits server-side to `[]`, so
   *  this is safe to call on every keystroke including the first. */
  airportSearch: (q: string, fixes = false, near = "") =>
    planner
      .GET("/api/airports/search", { params: { query: { q, fixes: fixes || undefined, near: near || undefined } } })
      .then(data<AirportSearch>)
      .then((r) => r.airports),

  /** One airport's card: where it is, the airspace over it, its runways
   *  and radio, and the weather there now. Ahead of the chart's tiles,
   *  as the fields in view are (`priority`). */
  airport: (ident: string) =>
    planner.GET("/api/airport/{ident}", { params: { path: { ident } }, priority: "high" }).then(data<AirportPlace>),
  /** The pictures an airport's card swipes through behind its diagram. */
  airportPhotos: (ident: string) => planner.GET("/api/airport/{ident}/photos", { params: { path: { ident } } }).then(data<AirportPhotos>),
  /** What the field offers on the ground, for a stop: its own request, as
   *  the places near it take the planner a second or two the first time. */
  airportServices: (ident: string) =>
    planner.GET("/api/airport/{ident}/services", { params: { path: { ident } } }).then(data<AirportServices>),
  /** The wind a TAF forecasts at a field for a time (ISO), its own or the
   *  nearest's within 30 nm; null where none covers it. */
  forecastWind: (ident: string, at: string) =>
    planner.GET("/api/airport/{ident}/forecast-wind", { params: { path: { ident }, query: { at } } }).then(data<ForecastWind | null>),
  /** The field's instrument procedures -- approaches, arrivals and
   *  departures -- from the FAA's CIFP, for the route's Procedures. */
  procedures: (ident: string) => planner.GET("/api/airport/{ident}/procedures", { params: { path: { ident } } }).then(data<ProcedureList>),
  /** One of them drawn for the map, with the transition picked. */
  procedure: (ident: string, procedure: string, transition: string | null) =>
    planner
      .GET("/api/airport/{ident}/procedures/{procedure}", {
        params: { path: { ident, procedure }, query: transition ? { transition } : {} },
      })
      .then(data<ProcedureDrawing>),
  /** An approach's plate's plan view placed on the map, where the planner
   *  could place it (wingtip.plates); 404 where it could not. */
  plate: (ident: string, procedure: string) =>
    planner.GET("/api/airport/{ident}/procedures/{procedure}/plate", { params: { path: { ident, procedure } } }).then(data<PlateOverlay>),
  /** The pages of one of the FAA's charts, by its address, drawn by the
   *  planner -- of a booklet, the ones naming `airport`. */
  faaChart: (url: string, airport: string) => planner.GET("/api/faa-chart", { params: { query: { url, airport } } }).then(data<ChartPages>),

  /** The landing fields inside a box, the biggest first, each with its
   *  METAR's flight category: what the map lays its chips and tap
   *  targets over, so the chart's own airports open cards. `reporting`,
   *  the ones with a METAR alone. Asked for ahead of the chart's tiles
   *  (`priority`): over plain http a browser opens six connections to
   *  a host, and on a zoom sixty tiles queued in front of it. */
  airportsInView: (box: { south: number; west: number; north: number; east: number; limit?: number; reporting?: boolean }) =>
    planner
      .GET("/api/airports/in-view", { params: { query: box }, priority: "high" })
      .then(data<AirportsInView>)
      .then((r) => r.airports),
};
