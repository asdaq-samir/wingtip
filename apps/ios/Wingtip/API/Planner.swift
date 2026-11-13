import CoreLocation
import Foundation
import PlannerAPI

/// A route's two ends and its stops, as /api/course gives them
/// (AirportEnd), and the line between them as pairs of latitude and
/// longitude (WingtipAPI/PlannerAPI).
typealias CourseEnd = APIAirportEnd
typealias Course = APICourse

extension Course {
    var coordinates: [CLLocationCoordinate2D] {
        courseLine.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
    }
}

/// The planner, through the gateway's proxy (`/api/planner/…`,
/// PlannerProxyController), with the pilot's session cookie as the
/// website's calls carry it: its generated client (PlannerAPI, Servers.swift)
/// under the names the app calls it by. Every type carries the planner's
/// own keys, so its answers decode with a plain decoder (`json`).
enum Planner {
    /// The planner's JSON for its generated types, which name their own
    /// snake-case keys.
    static let json = JSONDecoder()

    /// The app's own types of the planner's JSON, named in camel case:
    /// "flight_category" read as flightCategory.
    static let snakeCase: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    /// Bodies the planner reads, in its snake case; keys sorted, so the
    /// same question is the same bytes (the Go / No-Go's key).
    static let snakeEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = .sortedKeys
        return encoder
    }()

    struct Failure: Error, LocalizedError {
        let status: Int
        let detail: String?
        var errorDescription: String? { detail ?? "The planner answered \(status)." }
    }

    /// How long a call made in the air waits for the planner before the
    /// phone answers from what it keeps (the cycle packs): five seconds,
    /// not URLSession's sixty. With one bar of signal at altitude a call
    /// that hangs would hold the alert ahead past the next ten-second ask,
    /// which cancels it, so the packs' answer would never be shown. The
    /// whole call is bound by it (Servers.Wait.inFlight's
    /// timeoutIntervalForResource), not only the wait for data.
    static let inFlight: TimeInterval = 5

    /// How long a read the pilot is waiting on -- the plan's course, the
    /// nav log's stream, a chart tile, the search -- goes with no byte
    /// before it fails: about ten seconds, not URLSession's sixty, so on
    /// one bar of signal the kept plan, the kept tiles or "no connection"
    /// shows in seconds (the offline audit's gap 8). It counts time with
    /// no data (timeoutIntervalForRequest), so a nav log streaming its
    /// stages is not cut off.
    static let read: TimeInterval = 10

    /// How long a call that sends a large body (a photo to read, a logbook
    /// imported) waits: two minutes, as the upload itself takes time on a
    /// weak link.
    static let upload: TimeInterval = 120

    /// A route's stops as every planner call takes them: joined, or none.
    static func stops(_ stops: [String]) -> String? {
        stops.isEmpty ? nil : stops.joined(separator: ",")
    }

    /// FastAPI's `{"detail": "…"}`, where an answer carries one.
    static func detail(of data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["detail"] as? String
    }

    /// Which chart the map draws and where its tiles are (/api/chart).
    static func chart() async throws -> ChartInfo {
        try await call { try await $0.chartInfo().ok.body.json }
    }

    /// The fields in the map's view, fewer and bigger as it zooms out,
    /// with the flight category of each that reports (/api/airports/in-view).
    /// With `reporting`, only the fields that report, up to `limit`: the
    /// map's weather (FieldWeatherFeed), as the web map asks it.
    static func airports(south: Double, west: Double, north: Double, east: Double,
                         limit: Int? = nil, reporting: Bool = false) async throws -> [AirportPin] {
        try await call {
            try await $0.airportsInView(query: .init(south: south, west: west, north: north, east: east, limit: limit, reporting: reporting ? true : nil))
                .ok.body.json.airports
        }
    }

    /// The fields nearest a point (/api/airports/nearest), nearest first.
    /// Asked in the air (Nearest, Direct To, the watch), so it waits no
    /// longer than inFlight.
    static func nearest(lat: Double, lon: Double, limit: Int = 10) async throws -> [NearestAirport] {
        try await call(.inFlight) { try await $0.nearestAirports(query: .init(lat: lat, lon: lon, limit: limit)).ok.body.json.airports }
    }

    /// The airplanes heard about a point (/api/traffic), out to a radius.
    static func traffic(lat: Double, lon: Double, radiusNm: Double) async throws -> TrafficAnswer {
        try await call { try await $0.trafficNear(query: .init(lat: lat, lon: lon, radius: radiusNm.rounded())).ok.body.json }
    }

    /// Fields by ident or name as they are typed (/api/airports/search);
    /// with `fixes`, the named fixes too (VFR and GPS waypoints, `kind`
    /// "fix"), for the one search's Waypoints group.
    static func search(_ q: String, fixes: Bool = false) async throws -> [AirportSuggestion] {
        try await call(.read) { try await $0.airportSearch(query: .init(q: q, fixes: fixes ? true : nil)).ok.body.json.airports }
    }

    /// A field's card: its weather, runways, frequencies and pattern
    /// (/api/airport/{ident}); with `timeout`, as a read the pilot is
    /// waiting on (Planner.read), the card saying so when it passes.
    static func place(_ ident: String, timeout: TimeInterval? = nil) async throws -> AirportPlace {
        try await call(timeout == nil ? .usual : .read) { try await $0.airportPlace(path: .init(ident: ident)).ok.body.json }
    }

    /// The route's checkpoints, the ones picked for the nav log
    /// (/api/checkpoints): read off the chart, so the first ask for a new
    /// route takes a while.
    static func checkpoints(dep: String, dest: String, stops: [String]) async throws -> [Checkpoint] {
        try await call { try await $0.checkpoints(query: .init(dep: dep, dest: dest, stops: Self.stops(stops))).ok.body.json.selected }
    }

    /// The ground and airspace under the route, for the profile
    /// (/api/route-profile).
    static func routeProfile(dep: String, dest: String, stops: [String]) async throws -> RouteProfile {
        try await call { try await $0.routeProfile(query: .init(dep: dep, dest: dest, stops: Self.stops(stops))).ok.body.json }
    }

    /// What the airplane's track runs into in the next minutes
    /// (/api/airspace/ahead): the planner's alerts, in its words. Waits no
    /// longer than inFlight, so OwnShip falls back to the packs.
    static func ahead(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?) async throws -> [AheadAlert] {
        try await call(.inFlight) {
            try await $0.airspaceAhead(query: .init(lat: lat, lon: lon, track: trackDeg.rounded(), gs: groundspeedKt.rounded(), alt: altitudeFt?.rounded()))
                .ok.body.json.alerts
        }
    }

    /// The ways to fly a route (/api/route-options): the planner's grid
    /// search round what the direct line meets. The pilot's own figures
    /// with it, which an own airplane of no stock type flies on alone (the
    /// planner's aircraft "own").
    static func routeOptions(dep: String, dest: String, stops: [String], aircraft: String?, figures: Figures = Figures()) async throws -> RouteOptions {
        let query = Operations.RouteOptions.Input.Query(
            dep: dep, dest: dest, stops: Self.stops(stops), aircraft: aircraft, cruiseTasKt: figures.cruiseTasKt, fuelBurnGph: figures.fuelBurnGph,
            usableFuelGal: figures.usableFuelGal, serviceCeilingFt: figures.serviceCeilingFt, taxiFuelGal: figures.taxiFuelGal, glideRatio: figures.glideRatio)
        return try await call { try await $0.routeOptions(query: query).ok.body.json }
    }

    /// A field's procedures (/api/airport/{ident}/procedures).
    static func procedures(_ ident: String) async throws -> ProcedureList {
        try await call { try await $0.airportProcedures(path: .init(ident: ident)).ok.body.json }
    }

    /// An ATC clearance heard: the places it named, found near the route
    /// (/api/clearance/places, the engine's clearance_places rule). Heard in
    /// the air, so it waits no longer than inFlight before the packs read it
    /// (Engine.hear).
    static func clearancePlaces(_ ask: ClearanceAsk) async throws -> ClearancePlaces {
        try await call(.inFlight) { try await $0.clearancePlaces(body: .json(ask)).ok.body.json }
    }

    /// The names a clearance near the route will likely say, for the
    /// recognizer's contextualStrings (/api/clearance/words).
    static func clearanceWords(near: String, dep: String) async throws -> [String] {
        try await call { try await $0.clearanceWords(query: .init(near: near.isEmpty ? nil : near, dep: dep.isEmpty ? nil : dep)).ok.body.json.words }
    }

    /// An airplane by its N-number in the FAA's registry (/api/traffic/find).
    static func registered(_ tail: String) async throws -> AircraftRegistration? {
        try await call { try await $0.trafficFind(query: .init(q: tail)).ok.body.json.registered }
    }

    /// The planner's airplane types (/api/aircraft-profiles): each the
    /// picker's summary of its profile, read as the profile it summarises
    /// (the members it leaves out are the profile's optional ones).
    static func aircraftProfiles() async throws -> [AircraftProfile] {
        try await call { try await $0.aircraftProfiles().ok.body.json.profiles }.map { try Engine.recoded($0) }
    }

    /// The route as entered, its ends found and its line (/api/course).
    static func course(dep: String, dest: String, stops: [String]) async throws -> Course {
        try await call(.read) { try await $0.course(query: .init(dep: dep, dest: dest, stops: Self.stops(stops))).ok.body.json }
    }
}
