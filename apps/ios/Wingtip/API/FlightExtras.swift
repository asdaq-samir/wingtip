import Foundation

// The planner's and the gateway's answers the in-flight, traffic and
// route-editing screens read, generated from their OpenAPI documents
// (Generated/, scripts/build/api-models-apps.sh): the names the app uses
// are typealiases here, with what the app adds as extensions. The
// planner's are read in its snake case through Planner.snakeCase.

/// A point of an airplane's track today (TrailPoint): when, s since 1970,
/// where, and its height, none on the ground.
typealias TrailPoint = APITrailPoint
/// The field a tracked airplane took off from today, and when.
typealias FlightDeparted = APIFlightDeparted
/// A US airplane's record in the FAA's registry (AircraftRegistration).
/// The owner's town, never the street.
typealias FAARecord = APIAircraftRegistration
/// An airplane being tracked: what it is and who flies it, where it took
/// off from and its track today.
typealias FlightDetail = APIFlightDetail
/// A field one of an airplane's flights began or ended at.
typealias PastFlightField = APIPastFlightField
/// Where and when an airplane last landed.
typealias FlightArrival = APIFlightArrival
/// An airplane's state now, for the alerts set on it.
typealias FlightStatus = APIFlightStatus
/// One of an airplane's flights found: off and on, s since 1970.
typealias PastFlightSummary = APIPastFlightSummary
typealias PastFlights = APIPastFlights
/// A report of a past flight.
typealias PastFlightPoint = APIPastFlightPoint
typealias PastFlight = APIPastFlight
/// Where each airplane is based, by ICAO address.
typealias AircraftBases = APIAircraftBases
/// Airplanes found by name: those in the air, and the FAA's record of
/// one named by its N-number where none is.
typealias TrafficFound = APITrafficFound
/// A flight number's scheduled route, from Virtual Radar Server's route
/// database: not the flight plan filed.
typealias RouteAirport = APIRouteAirport
typealias FlightRoute = APIFlightRoute
/// A procedure's fix as the chart sets it: its altitudes, the least and
/// the most, and its roles (IAF, FAF…).
typealias ProcedureFix = APIProcedureFix
typealias ProcedureDrawing = APIProcedureDrawing

extension PastFlightSummary: Identifiable, Hashable {
    /// Back where it left from: a local flight.
    var local: Bool { !inAir && origin != nil && origin?.ident == destination?.ident }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

extension PastFlightField: Hashable {
    func hash(into hasher: inout Hasher) {
        hasher.combine(ident)
        hasher.combine(name)
    }
}

extension ProcedureFix: Identifiable {
    var id: String { ident }

    /// The chart's altitude in words, as an approach chart sets it (the
    /// FAA's Aeronautical Chart User's Guide: a minimum altitude
    /// underlined, a maximum overlined, a mandatory both): "at 3,000 ft",
    /// "at or above 2,400 ft", "between 3,000 and 4,000 ft". Which of the
    /// four it is, and its lines top first, are the engine's
    /// `altitude_lines`, as the web app draws them; the words are the
    /// app's. Nil for a fix the chart gives no altitude; thrown where the
    /// engine cannot answer.
    func charted() throws -> String? {
        let set = try Engine.altitudeLines(minFt: minFt.map(Double.init), maxFt: maxFt.map(Double.init))
        guard let crossing = set.crossing, let top = set.lines.first else { return nil }
        let feet = { (ft: Double) in Format.altitude(ft) }
        switch crossing {
        case "at": return "at \(feet(top.ft))"
        case "between": return "between \(Format.grouped(set.lines.last?.ft ?? top.ft)) and \(feet(top.ft))"
        case "at_or_above": return "at or above \(feet(top.ft))"
        case "at_or_below": return "at or below \(feet(top.ft))"
        default: return nil
        }
    }
}

/// One line of the checkpoints' notes as they are written: "start", one
/// "checkpoint" each, "error", "done". The planner's document does not
/// describe the stream's lines, so this one is the app's.
struct NoteLine: Codable, Equatable, Sendable {
    let type: String
    var count: Int?
    var id: String?
    var lat: Double?
    var lon: Double?
    var description: String?
    var source: String?
    var detail: String?
}

/// Flight Service, where the gateway has it connected (FlightServiceStatus).
typealias FlightServiceStatus = GWFlightServiceStatus

/// A flight plan as the gateway files it, its items as FAA Form 7233-4
/// writes them (AIM Appendix 4).
typealias FlightPlanFilingRequest = GWFlightPlanFilingRequest

/// A saved flight's flown track (TrackDto): t in ms since 1970, GPS
/// altitude in feet.
typealias SavedTrackPoint = GWTrackPointDto
typealias SavedTrack = GWTrackDto

extension Planner {
    static func flight(_ hex: String) async throws -> FlightDetail {
        try await fetch(FlightDetail.self, "/api/traffic/flight/\(hex)")
    }

    static func flightStatus(_ hex: String) async throws -> FlightStatus {
        try await fetch(FlightStatus.self, "/api/traffic/flight/\(hex)/status")
    }

    /// Ten flights, newest first; with `until` and `before`, the ten before.
    static func pastFlights(_ hex: String, until: String? = nil, before: Double? = nil) async throws -> PastFlights {
        try await fetch(PastFlights.self, "/api/traffic/flight/\(hex)/history", ["until": until, "before": before.map { String(Int($0)) }])
    }

    static func pastFlight(_ hex: String, id: Int) async throws -> PastFlight {
        try await fetch(PastFlight.self, "/api/traffic/flight/\(hex)/history/\(id)")
    }

    static func based(_ hexes: [String]) async throws -> AircraftBases {
        try await fetch(AircraftBases.self, "/api/traffic/based", ["hex": hexes.prefix(60).joined(separator: ",")])
    }

    static func findTraffic(_ q: String) async throws -> TrafficFound {
        try await fetch(TrafficFound.self, "/api/traffic/find", ["q": q])
    }

    /// A flight number's route; nil for one that is not an airline's.
    static func flightRoute(callsign: String, lat: Double?, lon: Double?) async throws -> FlightRoute? {
        try await fetch(FlightRoute?.self, "/api/traffic/route", ["callsign": callsign, "lat": lat.map { String($0) }, "lon": lon.map { String($0) }])
    }

    static func procedure(_ ident: String, id: String, transition: String?) async throws -> ProcedureDrawing {
        try await fetch(ProcedureDrawing.self, "/api/airport/\(ident)/procedures/\(id)", ["transition": transition])
    }

    /// One "how to spot it" line per checkpoint, as they are written: each
    /// a billed call, so asked for only on the pilot's tap.
    /// Claude's, so nothing is asked while the server's Claude features
    /// are off (ServerFeatures): the stream ends empty.
    static func describeCheckpoints(dep: String, dest: String, stops: [String],
                                    claudeOn: Bool = ServerFeatures.claudeOnNow) -> AsyncThrowingStream<NoteLine, any Error> {
        guard claudeOn else { return AsyncThrowingStream { $0.finish() } }
        let ask = APIGenerateNotesRequest(departureIdent: dep, destinationIdent: dest, stops: stops)
        return lines({ try await request("POST", "/api/checkpoint-notes/generate", json: ask, csrf: true) }) {
            try snakeCase.decode(NoteLine.self, from: $0)
        }
    }

    /// A pilot's own note on a checkpoint, saved.
    static func saveNote(dep: String, dest: String, stops: [String], lat: Double, lon: Double, text: String) async throws {
        let note = APICheckpointNoteRequest(departureIdent: dep, description: text, destinationIdent: dest, lat: lat, lon: lon, stops: stops)
        _ = try await data(for: request("POST", "/api/checkpoint-notes", json: note, csrf: true), ok: 200...299)
    }

    /// Every note of the pilot's own forgotten; how many.
    static func forgetNotes() async throws -> Int {
        try snakeCase.decode(APIPilotNotesForgotten.self, from: try await data(for: request("DELETE", "/api/checkpoint-notes/mine", json: nil, csrf: true))).removed
    }
}

extension Gateway {
    /// Flight Service's state; nil where it cannot be asked (signed out).
    static func flightService() async throws -> FlightServiceStatus? {
        try await read(FlightServiceStatus.self, "/api/flight-service")
    }

    /// Filed, Flight Service's reference for it.
    static func file(_ plan: FlightPlanFilingRequest) async throws -> String {
        try await send(GWFlightPlanFiled.self, "POST", "/api/flight-service/flight-plans", json: plan).reference
    }

    /// Flight Service's standard briefing for the flight, as its text.
    static func standardBriefing(_ plan: FlightPlanFilingRequest) async throws -> String {
        String(decoding: try await send("POST", "/api/flight-service/briefings", json: plan), as: UTF8.self)
    }

    /// A saved flight's flown track; nil where none is kept.
    static func track(_ flight: Int) async throws -> SavedTrack? {
        try await read(SavedTrack.self, "/api/flights/\(flight)/track", none: [204, 404])
    }

    static func saveTrack(_ flight: Int, _ track: SavedTrack) async throws {
        try await send("PUT", "/api/flights/\(flight)/track", json: track)
    }

    static func deleteTrack(_ flight: Int) async throws {
        try await send("DELETE", "/api/flights/\(flight)/track")
    }
}
