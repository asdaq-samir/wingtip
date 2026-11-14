import Foundation

// The planner's and the gateway's answers the in-flight, traffic and
// route-editing screens read, generated from their OpenAPI documents
// (Generated/, scripts/build/api-models-apps.sh): the names the app uses
// are typealiases here, with what the app adds as extensions. Each type
// names its server's own keys.

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

extension PastFlightSummary: @retroactive Identifiable {
    /// Back where it left from: a local flight.
    var local: Bool { !inAir && origin != nil && origin?.ident == destination?.ident }
}

extension ProcedureFix: @retroactive Identifiable {
    public var id: String { ident }

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
        try await call { try await $0.trafficFlight(path: .init(hexId: hex)).ok.body.json }
    }

    static func flightStatus(_ hex: String) async throws -> FlightStatus {
        try await call { try await $0.trafficStatus(path: .init(hexId: hex)).ok.body.json }
    }

    /// Ten flights, newest first; with `until` and `before`, the ten before.
    static func pastFlights(_ hex: String, until: String? = nil, before: Double? = nil) async throws -> PastFlights {
        try await call { try await $0.trafficHistory(path: .init(hexId: hex), query: .init(until: until, before: before?.rounded(.down))).ok.body.json }
    }

    static func pastFlight(_ hex: String, id: Int) async throws -> PastFlight {
        try await call { try await $0.trafficPastFlight(path: .init(hexId: hex, flightId: id)).ok.body.json }
    }

    static func based(_ hexes: [String]) async throws -> AircraftBases {
        try await call { try await $0.trafficBased(query: .init(hex: hexes.prefix(60).joined(separator: ","))).ok.body.json }
    }

    static func findTraffic(_ q: String) async throws -> TrafficFound {
        try await call { try await $0.trafficFind(query: .init(q: q)).ok.body.json }
    }

    /// A flight number's route; nil for one that is not an airline's,
    /// which the planner answers with a bare null the generated type
    /// cannot be read from.
    static func flightRoute(callsign: String, lat: Double?, lon: Double?) async throws -> FlightRoute? {
        do {
            return try await call { try await $0.trafficRoute(query: .init(callsign: callsign, lat: lat, lon: lon)).ok.body.json }
        } catch is DecodingError {
            return nil
        }
    }

    static func procedure(_ ident: String, id: String, transition: String?) async throws -> ProcedureDrawing {
        try await call { try await $0.airportProcedure(path: .init(ident: ident, procedure: id), query: .init(transition: transition)).ok.body.json }
    }

    /// The route's checkpoints, each with the note kept for it: the
    /// pilot's own, else the shared one, or none.
    static func routeNotes(dep: String, dest: String, stops: [String]) async throws -> [APIRouteNote] {
        let ask = APIRouteNotesRequest(departureIdent: dep, destinationIdent: dest, stops: stops)
        return try await call { try await $0.routeNotes(body: .json(ask)).ok.body.json.checkpoints }
    }

    /// A pilot's own note on a checkpoint, saved.
    static func saveNote(dep: String, dest: String, stops: [String], lat: Double, lon: Double, text: String) async throws {
        let note = APICheckpointNoteRequest(departureIdent: dep, description: text, destinationIdent: dest, lat: lat, lon: lon, stops: stops)
        _ = try await call { try await $0.saveCheckpointNote(body: .json(note)) }
    }
}

extension Gateway {
    /// Every note of the pilot's own forgotten; how many. The gateway's
    /// DELETE /api/me/checkpoint-notes, which knows who the pilot is
    /// (CODE-1): the planner's DELETE through the proxy never reached it.
    static func forgetNotes() async throws -> Int {
        try await call { try await $0.forgetNotes().ok.body.json.removed }
    }

    /// Flight Service's state; nil where it cannot be asked (signed out).
    static func flightService() async throws -> FlightServiceStatus? {
        try await read { try await $0.status().ok.body.json }
    }

    /// Filed, Flight Service's reference for it.
    static func file(_ plan: FlightPlanFilingRequest) async throws -> String {
        try await call { try await $0.file(body: .json(plan)).ok.body.json.reference }
    }

    /// Flight Service's standard briefing for the flight, as its text.
    static func standardBriefing(_ plan: FlightPlanFilingRequest) async throws -> String {
        let body = try await call { try await $0.brief(body: .json(plan)).ok.body.any }
        return try await String(collecting: body, upTo: 1 << 20)
    }

    /// A saved flight's flown track; nil where none is kept.
    static func track(_ flight: Int) async throws -> SavedTrack? {
        try await read(none: [401, 403, 404]) {
            switch try await $0.track(path: .init(id: flight)) {
            case .ok(let ok): try ok.body.json
            default: nil
            }
        }
    }

    static func saveTrack(_ flight: Int, _ track: SavedTrack) async throws {
        _ = try await call(.upload) { try await $0.saveTrack(path: .init(id: flight), body: .json(track)) }
    }

    static func deleteTrack(_ flight: Int) async throws {
        _ = try await call { try await $0.deleteTrack(path: .init(id: flight)) }
    }
}
