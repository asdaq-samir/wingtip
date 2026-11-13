import { planner, data, ndjson, stopsParam } from "./http";
import { airplaneQuery } from "./airplaneQuery";
import type {
  AircraftChoice,
  AircraftProfiles,
  Alternates,
  AltitudeChoice,
  IcingForecast,
  Briefing,
  CheckpointNoteSaved,
  RouteNotes,
  Checkpoints,
  Course,
  NavLogMessage,
  RouteProfile,
  RouteOptions,
  Totals,
  ClearanceAsk,
  ClearancePlaces,
  DepartureWindow,
  DepartureWindowAsk,
  LogbookDraft,
  LogbookDraftAsk,
} from "./types";

/** The planner's calls for a route and its plan (./client's `api`): the course, the
 *  checkpoints, the nav log, the briefing, the ways to fly it and what is
 *  asked of them. */
export const plannerRoute = {
  /** The leg itself, through any stops: sub-second, and enough to draw
   *  before any tile is read. */
  course: (dep: string, dest: string, stops?: string[], signal?: AbortSignal, cycle?: string) =>
    planner.GET("/api/course", { params: { query: { dep, dest, stops: stopsParam(stops), c: cycle } }, signal }).then(data<Course>),

  /** Scored candidates and the subset worth flying, hop by hop. Fast --
   *  the model is loaded and the features are already built -- once the
   *  chart is read along the route, which on a new one is seconds: given
   *  up with `signal` when the route changes (checkpointsQuery). */
  /** `ahead`: asked for before the pilot does (PlanWorkspace's Recents and
   *  Saved planned ahead), its chart reads queued behind the pilot's own
   *  (the planner's chart_model.READ_AHEAD). */
  checkpoints: (dep: string, dest: string, stops?: string[], signal?: AbortSignal, ahead = false, cycle?: string) =>
    planner
      .GET("/api/checkpoints", { params: { query: { dep, dest, stops: stopsParam(stops), ahead: ahead || undefined, c: cycle } }, signal })
      .then(data<Checkpoints>),

  /**
   * The slow half: terrain, the obstacle file, the airspace shapefile
   * and live winds. Asked for separately so none of it delays the
   * chart, and streamed rather than one blocking response so a pilot
   * sees which of those it's actually doing right now. `depart`, an ISO
   * instant, picks the winds forecast period; absent means about now.
   * `altitudeChoice` is which of the planner's four plans the legs
   * fly, meaningful only without a typed altitude.
   */
  async *navlog(
    dep: string,
    dest: string,
    altitudeFt?: string,
    aircraft?: AircraftChoice,
    altitudeChoice?: AltitudeChoice,
    depart?: string,
    signal?: AbortSignal,
    stops?: string[],
    classBClearance?: boolean,
    altitudes?: string,
    checkpoints = true,
    rules: "vfr" | "ifr" = "vfr",
    alternate = "",
    procedures = "",
    crossings = "",
    ground = "",
    holds = "",
    altitudeNearest = false,
    runways = "",
    patterns = "",
    ahead = false,
    altitudeStarts = "",
  ): AsyncGenerator<NavLogMessage> {
    const result = await planner.GET("/api/navlog", {
      params: {
        query: {
          dep,
          dest,
          stops: stopsParam(stops),
          altitude_ft: altitudeFt ? Number(altitudeFt) : undefined,
          // Picked on the wheel: each leg at its nearest legal altitude.
          altitude_nearest: altitudeFt && altitudeNearest ? true : undefined,
          altitude_choice: altitudeChoice && altitudeChoice !== "fastest" ? altitudeChoice : undefined,
          ...airplaneQuery(aircraft),
          depart: depart || undefined,
          class_b_clearance: classBClearance || undefined,
          altitudes: altitudes || undefined,
          altitude_starts: altitudeStarts || undefined, // begun there: Start At
          checkpoints: checkpoints ? undefined : false,
          // Under IFR (the planner's wingtip.ifr); VFR, the default, unsaid.
          rules: rules === "ifr" ? rules : undefined,
          // The IFR alternate filed, whose fuel is in the totals.
          alternate: rules === "ifr" && alternate ? alternate : undefined,
          procedures: procedures || undefined, // flown by, descended to
          // The runway each departure picked is left from.
          runways: runways || undefined,
          // With none picked at a field, its runway into the wind, the one
          // the page picks a moment later (the planner's wind_picks): the
          // first plan flies its patterns, where its time jumped as the
          // picks came and the route was planned again.
          wind_runways: true,
          // Asked for before the pilot does, its chart reads behind theirs.
          ahead: ahead || undefined,
          // The runway each field is landed on, its pattern flown in.
          patterns: patterns || undefined,
          // The altitudes given to cross their fixes at.
          crossings: crossings || undefined,
          ground: ground || undefined,
          holds: holds || undefined, // flown on the legs leaving their points
        },
      },
      parseAs: "stream",
      signal,
    });
    yield* ndjson<NavLogMessage>(result.data as ReadableStream | undefined);
  },
  /** The stock performance profiles the nav log can be computed for. */
  aircraftProfiles: () =>
    planner
      .GET("/api/aircraft-profiles")
      .then(data<AircraftProfiles>)
      .then((r) => r.profiles),
  /** Under IFR: the destination's "1-2-3" (14 CFR 91.169(b)) for an ETA,
   *  the pilot's alternate checked at its own (91.169(c)), and the nearest
   *  fields that will do, reached at `tasKt`. */
  alternate: (dest: string, eta: string, tasKt: number, alternate?: string) =>
    planner
      .GET("/api/alternate", { params: { query: { dest, eta, tas_kt: tasKt, alternate: alternate || undefined } } })
      .then(data<Alternates>),

  /** Under IFR, the AWC's forecast icing (CIP and FIP, as its GFA draws
   *  them) on each leg at the altitude flown (wingtip.icing_forecast): the
   *  nav log's fixes and each leg's altitude, ETE and time on the ground. */
  icingRoute: (q: { fixes: string; altFt: string; legMin: string; groundMin: string; depart?: string }) =>
    planner
      .GET("/api/icing/route", {
        params: { query: { fixes: q.fixes, alt_ft: q.altFt, leg_min: q.legMin, ground_min: q.groundMin, depart: q.depart || undefined } },
      })
      .then(data<IcingForecast>),

  /** A flight from one airport back to it, with no stops -- the pattern,
   *  practice approaches: its time aloft at the airplane's burn, and the
   *  fuel check. */
  localFlight: (ident: string, durationMin: number, aircraft?: AircraftChoice, depart?: string, rules: "vfr" | "ifr" = "vfr") =>
    planner
      .GET("/api/local-flight", {
        params: {
          query: {
            dep: ident,
            dest: ident,
            duration_min: durationMin,
            ...airplaneQuery(aircraft),
            depart: depart || undefined,
            rules: rules === "ifr" ? rules : undefined,
          },
        },
      })
      .then(data<Totals>),
  /** Adverse conditions, current/forecast weather, and airport info
   *  for the briefing -- one plain response, not a stream: every piece
   *  is a single quick call, not navlog's slow per-leg loop. */
  /** The briefing for the flight: its forecast is read from `depart`
   *  (now when empty) to an hour past arrival, `eteMin` later. */
  /** The route from the side: the ground and the airspace along it. */
  routeProfile: (dep: string, dest: string, stops?: string[]) =>
    planner.GET("/api/route-profile", { params: { query: { dep, dest, stops: stopsParam(stops) } } }).then(data<RouteProfile>),

  /** `legs`, the nav log's (lib/briefingLegs), places each hazard on its
   *  legs and times it by their ETEs (Briefing's `on_route`). */
  briefing: (
    dep: string,
    dest: string,
    depart?: string,
    eteMin?: number,
    stops?: string[],
    signal?: AbortSignal,
    legs?: { fixes: string; legMin: string; groundMin: string } | null,
  ) =>
    planner
      .GET("/api/briefing", {
        params: {
          query: {
            dep,
            dest,
            stops: stopsParam(stops),
            depart,
            ete_min: eteMin,
            ...(legs ? { fixes: legs.fixes, leg_min: legs.legMin, ground_min: legs.groundMin } : {}),
          },
        },
        signal,
      })
      .then(data<Briefing>),
  /** The route's checkpoints, each with the note kept for it (the
   *  pilot's own, else the shared one). */
  checkpointNotes: (dep: string, dest: string, stops: string[] = [], signal?: AbortSignal) =>
    planner
      .POST("/api/checkpoint-notes/route", { body: { departure_ident: dep, destination_ident: dest, stops }, signal })
      .then(data<RouteNotes>),
  /** A pilot's own edit to one checkpoint's identification note. */
  saveCheckpointNote: (dep: string, dest: string, lat: number, lon: number, description: string, stops: string[] = []) =>
    planner
      .POST("/api/checkpoint-notes", { body: { departure_ident: dep, destination_ident: dest, stops, lat, lon, description } })
      .then(data<CheckpointNoteSaved>),
  /** An ATC clearance heard (lib/clearance): the places it named, found
   *  near the route (the engine's clearance_places). */
  clearancePlaces: (body: ClearanceAsk) => planner.POST("/api/clearance/places", { body }).then(data<ClearancePlaces>),

  /** "When should I go?": the Go / No-Go for each departure hour the
   *  forecasts reach, and the best windows (the planner's app.window). */
  departureWindow: (body: DepartureWindowAsk, signal?: AbortSignal) =>
    planner.POST("/api/departure-window", { body, signal }).then(data<DepartureWindow>),
  /** The logbook entry a recorded track makes, for the pilot to review
   *  (the engine's logbook_from_track, the fields and approaches round
   *  the track found by the planner); nothing saved. */
  logbookDraft: (body: LogbookDraftAsk, signal?: AbortSignal) =>
    planner.POST("/api/logbook-draft", { body, signal }).then(data<LogbookDraft>),
  /** The ways to fly a route, for FPL's Routes: the fastest, the best
   *  weather's and the fewest stops', round storms, weather under the
   *  minimums given, prohibited areas, TFRs and high ground; and what the
   *  pilot's own route (`stops`) meets. */
  routeOptions: (
    dep: string,
    dest: string,
    stops: string,
    aircraft: AircraftChoice | undefined,
    depart: string | undefined,
    minimums: { ceilingFt: number | null; visibilitySm: number | null },
  ) =>
    planner
      .GET("/api/route-options", {
        params: {
          query: {
            dep,
            dest,
            stops: stops || undefined,
            ...airplaneQuery(aircraft),
            depart: depart || undefined,
            min_ceiling_ft: minimums.ceilingFt ?? undefined,
            min_visibility_sm: minimums.visibilitySm ?? undefined,
          },
        },
      })
      .then(data<RouteOptions>),
};
