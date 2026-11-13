/**
 * The shapes the API returns.
 *
 * Everything a server sends is generated from its own OpenAPI
 * document by `npm run types` -- the Python planner's from
 * services/planner/openapi.json into ./schema.d.ts, this app's Spring
 * Boot endpoints from services/gateway/openapi.json into
 * ./gateway-schema.d.ts -- and re-exported here under the names the pages
 * use, so a field renamed in services/planner/app/schemas/ or in a
 * Java DTO is a compile error at every call site rather than a silent
 * `undefined` at runtime. What is written by hand below is only what
 * no server schema describes: the page's own compositions.
 */
import type { components } from "./schema";
import type { components as GatewayComponents } from "./gateway-schema";
import type { OwnFigureValues } from "../airplane/figures";

type Schemas = components["schemas"];
type Gateway = GatewayComponents["schemas"];

// ---------------------------------------------------------------------
// The planner.

export type Airport = Schemas["AirportEnd"];
export type Course = Schemas["Course"];
/** A waypoint that keeps a route out of the Class B that stops it. */
export type Detour = Schemas["Detour"];
/** An altitude the pilot set for a hop and what is wrong with it (the
 *  planner's own_altitude_caution): a warning, not a refusal. */
/** One chart kind the map may draw, with its zooms -- and, for an
 *  overlay, its sheets and where each is. */
export type ChartLayer = Schemas["ChartLayer"];
export type ChartSheet = Schemas["ChartSheet"];
/** A scored OSM candidate. `selected` is set by the server's greedy pass. */
export type Candidate = Schemas["Candidate"];
export type Checkpoints = Schemas["Checkpoints"];
/** One dead-reckoning leg. `wind` is null when no winds-aloft station is
 *  near enough, which is not the same as calm; groundspeed/ETE/fuel are
 *  null when the wind exceeds true airspeed and the leg cannot be flown. */
export type Leg = Schemas["Leg"];
export type LegProcedure = Schemas["LegProcedure"];
export type LegHold = Schemas["LegHold"];
/** Where a leg's climb tops out (TOC), from the leg's start, and the
 *  climb's speeds on the way up. */
export type TopOfClimb = Schemas["TopOfClimb"];
/** Where a leg's descent starts (TOD), to what and at what rate. */
export type TopOfDescent = Schemas["TopOfDescent"];
export type Totals = Schemas["Totals"];
export type FuelStopSuggestion = Schemas["FuelStopSuggestion"];
export type AltitudeBreakdown = Schemas["AltitudeBreakdown"];
export type AltitudeSegment = Schemas["AltitudeSegment"];
/** One of the four plans: lowest, highest, fastest for the winds, and
 *  economical, the least fuel, climb and cruise. */
export type AltitudeOption = Schemas["AltitudeOption"];
export type AltitudeChoice = AltitudeOption["kind"];
/** An airplane's flights of the last seven days (wingtip.traffic.history). */
export type PastFlights = Schemas["PastFlights"];
export type PastFlightSummary = Schemas["PastFlightSummary"];
/** One past flight's reports, for its track log and replay. */
export type PastFlight = Schemas["PastFlight"];
export type PastFlightPoint = Schemas["PastFlightPoint"];
export type AircraftProfile = Schemas["AircraftProfile"];
/** How an airplane is loaded: its POH's stations, limits and envelope. */
export type Loading = Schemas["Loading"];
/** A POH's short-field takeoff or landing distances. */
export type ShortField = Schemas["ShortField"];
/** One line of the nav log's stream: "stage" before each piece of work,
 *  "altitude" the moment that's decided, one "leg" per leg, then "done"
 *  with the totals; "error" for an unflyable route. */
export type NavLogMessage = Schemas["NavLogMessage"];
export type Runway = Schemas["Runway"];
export type Frequency = Schemas["Frequency"];
export type Briefing = Schemas["Briefing"];
export type OnRoute = Schemas["OnRoute"];
export type MapLayerAges = Schemas["MapLayerAges"];
/** An FAA data set the planner uses and whether its edition is still in
 *  its cycle (the engine's data_cycle). */
export type DataCycle = Schemas["DataCycle"];
/** `GET /api/alternate`: under IFR, whether the destination needs an
 *  alternate (14 CFR 91.169(b)), the pilot's alternate checked against its
 *  minimums at its ETA (91.169(c)), and the nearest fields that will do. */
export type Alternates = Schemas["Alternates"];
/** Under IFR, the forecast icing on each leg at the altitude flown
 *  (wingtip.icing_forecast). */
export type IcingForecast = Schemas["IcingForecast"];
export type AlternateCheck = Schemas["AlternateCheck"];

export type ChartInfo = Schemas["ChartInfo"];
export type AirportSearch = Schemas["AirportSearch"];
export type AirportPlace = Schemas["AirportPlace"];
/** What a field offers a pilot who lands there: the FAA's fuel, fees,
 *  parking and repair, and Overture Maps' places to eat, sleep and hire a
 *  car near it (wingtip.nearby). */
export type AirportServices = Schemas["AirportServices"];
export type NearbyPlace = Schemas["NearbyPlace"];
/** The pictures an airport's card swipes through behind its diagram: its
 *  aerial from the USGS and a photo from the ground from Wikipedia. */
export type AirportPhotos = Schemas["AirportPhotos"];
/** The fields along a route to stop at, for the map's Stops (wingtip.fuelstops.along). */
/** The ways to fly a route, for FPL's Routes (wingtip.route_options), and one of them. */
export type RouteOptions = Schemas["RouteOptions"];
export type RouteChip = Schemas["RouteChip"];
export type RouteOption = Schemas["RouteOption"];
export type ForecastWind = Schemas["ForecastWind"];
export type Metar = Schemas["Metar"];
export type TerminalChart = Schemas["TerminalChart"];
/** A field's instrument procedures from the FAA's CIFP, and one drawn
 *  with the transition picked (the planner's wingtip.procedures). */
export type ProcedureList = Schemas["ProcedureList"];
export type ProcedureSummary = Schemas["ProcedureSummary"];
export type ProcedureDrawing = Schemas["ProcedureDrawing"];
export type PlateOverlay = Schemas["PlateOverlay"];
/** A plate's own georeference, for own ship on its page (plate_page_point). */
export type PlateGeoreference = Schemas["PlateGeoreference"];
export type ProcedureFix = Schemas["ProcedureFix"];
export type ChartPages = Schemas["ChartPages"];
export type ClearanceAsk = Schemas["ClearanceAsk"];
export type ClearancePlaces = Schemas["ClearancePlaces"];
/** "When should I go?": the hours and the windows (app.window). */
export type DepartureWindowAsk = Schemas["DepartureWindowAsk"];
export type DepartureWindow = Schemas["DepartureWindow"];
export type WindowHour = Schemas["WindowHour"];
/** A flight logged from the app's own track: the draft entry and its reasons (app.routers.logbook_draft). */
export type LogbookDraftAsk = Schemas["LogbookDraftAsk"];
export type LogbookDraft = Schemas["LogbookDraft"];
export type DepartureWindowRun = Schemas["Window"];
export type AirportPin = Schemas["AirportInView"];
export type AirportsInView = Schemas["AirportsInView"];
/** The cycle's overlay tiles' archive (lib/map/sources/overlayTiles). */
export type OverlayTiles = Schemas["OverlayTiles"];
export type ModelComparison = Schemas["ModelComparison"];
export type Status = Schemas["Status"];
export type RetrainStarted = Schemas["RetrainStarted"];
export type ChartRefreshStarted = Schemas["ChartRefreshStarted"];
export type AircraftProfileSummary = Schemas["AircraftProfileSummary"];
export type AircraftProfiles = Schemas["AircraftProfiles"];
/** One Class B airport, with what the weather is doing there. Every
 *  weather field is optional and often absent, and absent must read as
 *  absent rather than as "nothing to worry about". Which terminal chart
 *  covers it is the map's own lookup (tiles.ts, sheetAt). */
export type ClassBAirport = Schemas["ClassBAirport"];
export type ClassBResponse = Schemas["ClassBResponse"];
/** A temporary flight restriction, with its areas, for the map. */
export type Tfr = Schemas["Tfr"];
export type Tfrs = Schemas["Tfrs"];
/** The fields nearest a position: how far, which way, the longest runway. */
export type NearestAirports = Schemas["NearestAirports"];
/** The emergency assistant's fields, wind aloft and airplane (features/emergency/emergency). */
export type EmergencyFields = Schemas["EmergencyFields"];
/** The map's Stops: the fields with fuel, food, repair or a flight school. */
export type StopFields = Schemas["StopFields"];
export type StopField = Schemas["StopField"];
export type NearestAirport = Schemas["NearestAirport"];
export type PlaceFound = Schemas["PlaceFound"];
export type PlacesFound = Schemas["PlacesFound"];
/** The route from the side: the ground and the controlled airspace. */
export type RouteProfile = Schemas["RouteProfile"];
export type AirspaceAt = Schemas["AirspaceAt"];
export type WeatherMap = Schemas["WeatherMap"];
/** The radar and satellite loop (wingtip.weather_loop). */
export type WeatherLoop = Schemas["WeatherLoop"];
export type LoopFrame = Schemas["LoopFrame"];
export type ForecastRunAsk = Schemas["ForecastRunAsk"];
export type ForecastRun = Schemas["ForecastRun"];
export type WeatherArea = Schemas["WeatherArea"];
export type MapPirep = Schemas["MapPirep"];
export type StationWind = Schemas["StationWind"];
/** What is ahead of own ship (wingtip.alerts). */
export type AlertsAhead = Schemas["AlertsAhead"];
// What the FAA's SWIM feeds say now (app.routers.live, lib/liveReports).
export type ItwsAlerts = Schemas["ItwsAlerts"];
/** What the in-flight copilot reads round the airplane (GET /api/copilot/around). */
export type CopilotAround = Schemas["CopilotAround"];
export type ItwsProduct = Schemas["ItwsProduct"];
export type SaaStatuses = Schemas["SaaStatuses"];
export type SaaStatus = Schemas["SaaStatus"];
export type AirportRvr = Schemas["AirportRvr"];
export type RunwayRvr = Schemas["RunwayRvr"];
export type AirportAtis = Schemas["AirportAtis"];
export type FlowAtAirports = Schemas["FlowAtAirports"];
export type FlowProgram = Schemas["FlowProgram"];
export type DepartureEvents = Schemas["DepartureEvents"];
export type DepartureEvent = Schemas["DepartureEvent"];
export type AheadAlert = Schemas["AheadAlert"];
/** The airplanes ADS-B receivers hear near a point (wingtip.traffic). */
export type Traffic = Schemas["Traffic"];
export type AircraftBases = Schemas["AircraftBases"];
export type TrafficAircraft = Schemas["TrafficAircraft"];
export type TrafficFound = Schemas["TrafficFound"];
/** A tracked flight: its airplane, where it took off, its path today. */
export type FlightDetail = Schemas["FlightDetail"];
/** An airplane's state now, for the alerts a pilot sets on it (wingtip.traffic.status). */
export type FlightStatus = Schemas["FlightStatus"];
/** A US airplane's record in the FAA's registry (wingtip.registry). */
export type AircraftRegistration = Schemas["AircraftRegistration"];
/** The route a flight number is scheduled to fly (wingtip.traffic.route). */
export type FlightRoute = Schemas["FlightRoute"];
/** The deployment's browser key for Google's map tiles (routers/basemaps). */
export type GoogleMaps = Schemas["GoogleMaps"];
/** The FAA's Digital Obstacle File in a box, tallest first (routers/terrain). */
export type Obstacles = Schemas["Obstacles"];
export type AirspaceBand = Schemas["AirspaceBand"];
export type VfrMinimums = Schemas["VfrMinimums"];
/** `available` is false where the planner has no Docker API to talk
 *  to, which is every deployment that is not the local stack. */
export type DevServices = Schemas["DevServices"];
export type DevServiceStarted = Schemas["DevServiceStarted"];

/** Which airplane the nav log is computed for: a stock profile by name
 *  (or "own", lib/airplane's OWN_AIRPLANE), with a pilot's own airplane's
 *  figures laid over it -- speeds, burns, fuel, ceiling, climb rate, start
 *  and taxi fuel, glide ratio, empty weight and moment, each where set
 *  (OwnFigureValues) -- and its id, so a saved flight records it. */
export interface AircraftChoice extends OwnFigureValues {
  profile: string;
  label: string;
  aircraftId?: number;
  /** An airplane picked by its N-number from the FAA's registry, flown on
   *  its type's stock profile: its N-number, for its own place in the
   *  picker (aircraftKey). */
  tail?: string;
  /** No airplane picked (preferences' NO_AIRPLANE): no profile (""), and no airplane figure. */
  none?: boolean;
}
export type CheckpointNoteSaved = Schemas["CheckpointNoteSaved"];
/** A route's checkpoints, each with the note kept for it: the pilot's own, else the shared one. */
export type RouteNotes = Schemas["RouteNotes"];

/** What the nav log stream's "altitude" message carries -- the generated
 *  shape, less its `type`. */
export type NavLogAltitude = Omit<Schemas["NavLogAltitude"], "type">;

// ---------------------------------------------------------------------
// The chart: what the detector found and what a pilot marked.

/** A point the chart-vision detector found. `rating` is null until a
 *  pick claims it; `rated` is derived from it. */
export type Detection = Schemas["Detection"];
/** A pick no detection claimed: a miss, or one whose detection has moved. */
export type LoosePick = Schemas["Pick"];
export type PickSaved = Schemas["PickSaved"];
export type PickDeleted = Schemas["PickDeleted"];
export type Classification = Schemas["Classification"];
/** One line of the detection stream. */
export type StreamMessage = Schemas["DetectMessage"];

export type Role = NonNullable<Detection["role"]>;
export type Source = LoosePick["source"];
export type Rating = NonNullable<Detection["rating"]>;

/** The ends of the leg. Steppable and described, but never rated. */
export interface Endpoint {
  endpoint: true;
  ident: string;
  name: string;
  lat: number;
  lon: number;
  along_track_nm: number;
  category: "departure" | "destination";
}

/** Anything the walk can land on. */
export type Point = Detection | LoosePick | Endpoint;

export function isEndpoint(p: Point): p is Endpoint {
  return (p as Endpoint).endpoint === true;
}

// ---------------------------------------------------------------------
// Spring Boot's own endpoints, camelCase (Jackson's default).

/** `GET /api/me`. 204, no body (not this shape), when signed out. `developer` is
 *  whether the training workspace and the developer console are theirs:
 *  granted with an UPDATE on the pilots table, never inherited -- see
 *  the V7 migration. */
export type Pilot = Gateway["PilotDto"];
/** `PUT /api/me/contact`: their telephone number and home base, for a
 *  flight plan's item 19. */
export type PilotContactRequest = Gateway["PilotContactRequest"];

/** How this deployment is reached -- SIGN_IN, OPEN or CLOSED -- asked
 *  before anyone has signed in (`/api/auth/capabilities`). */
export type SignInCapabilities = Gateway["Capabilities"];
/** `GET /api/subscription`: the signed-in pilot's subscription to the
 *  paid features (SubscriptionService) -- FREE, TRIAL, SUBSCRIBED or
 *  COMPED, until when, and whether the free month is still theirs to start.
 *  For showing: the server checks it again on every paid call. */
export type Subscription = Gateway["SubscriptionDto"];
/** The iOS app's Apple sign-in, done: where to go next. */
export type AppleSignedIn = Gateway["SignedIn"];
/** A TV's code to be signed in with from a phone (DeviceSignInController). */
export type DeviceCode = Gateway["DeviceCode"];

/** A pilot's own airplane, from `/api/aircraft`. `usableFuelGal` is
 *  null when the owner has not said, and then the nav log makes no
 *  fuel check. */
export type Aircraft = Gateway["AircraftDto"];
export type AircraftRequest = Gateway["AircraftRequest"];
/** An airplane's own handbook figures on its record, each null where not given. */
export type OwnFigures = Gateway["OwnFigures"];
/** An airplane's handbook figures as its pilot confirmed them from a photo. */
export type HandbookFigures = Gateway["HandbookFigures"];
/** A VOR check for IFR as the pilot records it (14 CFR 91.171(d)). */
export type VorCheckRequest = Gateway["VorCheckRequest"];
export type InspectionsRequest = Gateway["InspectionsRequest"];
export type Inspections = Gateway["InspectionsDto"];
export type Squawk = Gateway["SquawkDto"];
export type SquawkRequest = Gateway["SquawkRequest"];
export type Reminders = Gateway["RemindersDto"];
/** An airplane's due item: an AD's status (14 CFR 91.417(a)(2)(v)) or another. */
export type DueItem = Gateway["DueItemDto"];
export type DueItemRequest = Gateway["DueItemRequest"];
/** What falls due for the pilot and their airplanes (GET /api/paperwork). */
export type Paperwork = Gateway["PaperworkDto"];
export type Due = Gateway["DueDto"];
export type LogbookImportResult = Gateway["LogbookImportResult"];
export type FlightPlanFilingRequest = Gateway["FlightPlanFilingRequest"];
export type FlightServiceStatus = Gateway["FlightServiceStatus"];
export type FlightPlanFiled = Gateway["FlightPlanFiled"];
/** One day of one speed metric from one source and kind of device (SpeedController). */
export type SpeedDay = Gateway["SpeedDay"];
/** A page's Core Web Vitals from this browser (SpeedController, lib/speed). */
export type SpeedFieldReport = Gateway["FieldReport"];

/** One row of "My Flights" -- totals only; `Flight` carries the full
 *  filed nav log, fetched one flight at a time. */
export type FlightSummary = Gateway["FlightSummaryDto"];
export type Flight = Gateway["FlightDto"];
/** A saved flight's share, and a flight shared with whoever has its link (FlightShareController). */
export type FlightShare = Gateway["FlightShareDto"];
export type SharedFlight = Gateway["SharedFlightDto"];
/** A flight's flown track as saved to the account (lib/track). */
export type SavedTrack = Gateway["TrackDto"];
/** POST /api/flights body -- files (replacing any previous one) a nav
 *  log for a route this pilot planned. */
export type SaveFlightRequest = Gateway["SaveFlightRequest"];

/** A flight in the pilot's logbook, from `/api/logbook`. */
export type LogbookEntry = Gateway["LogbookEntryDto"];
export type LogbookEntryRequest = Gateway["LogbookEntryRequest"];
/** Where the pilot stands -- passengers by day and at night, the flight
 *  review, the medical -- and the logbook's totals. */
export type Currency = Gateway["CurrencyDto"];
export type CurrencyDatesRequest = Gateway["CurrencyDatesRequest"];
/** A student's way to the checkride: 61.109's experience from the
 *  logbook, the knowledge test report's ACS codes, the endorsements. */
export type Training = Gateway["TrainingDto"];
export type ExperienceItem = Gateway["ExperienceItemDto"];
/** One of the student endorsements, AC 61-65K's words with its blanks. */
export type EndorsementKind = Gateway["EndorsementKindDto"];
/** An endorsement an instructor signed in the app. */
export type SignedEndorsement = Gateway["SignedEndorsementDto"];
/** A solo cross-country put to an instructor (14 CFR 61.93(c)(3)). */
export type CrossCountryReview = Gateway["CrossCountryReviewDto"];
/** A pilot as a flight instructor: certificate, students, reviews, record. */
export type Instructor = Gateway["InstructorDto"];
export type InstructorRequest = Gateway["InstructorRequest"];
export type StudentRow = Gateway["StudentDto"];
/** One of a student's instructors, asked or taken. */
export type InstructorLink = Gateway["InstructorLinkDto"];
export type SignRequest = Gateway["SignRequest"];
/** An approach an instructor set a student to learn, and how far along they are. */
export type ApproachLesson = Gateway["ApproachLessonDto"];
export type AssignLessonRequest = Gateway["AssignLessonRequest"];
export type LessonProgressRequest = Gateway["LessonProgressRequest"];
export type QuizAnswer = Gateway["QuizAnswerDto"];
