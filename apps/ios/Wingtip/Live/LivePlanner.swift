import Foundation

// What the FAA's SWIM feeds say now, as the planner keeps it from ingest
// (app.routers.live, the web's lib/liveReports): an airport's D-ATIS and
// RVR, the Command Center's programs, special activity airspace's status
// from SFDPS, and a flight's tower departure events. The answers' types
// are generated from the planner's document (WingtipAPI/PlannerAPI).

/// An airport's D-ATIS broadcasts (/api/live/atis, wingtip.datis).
typealias AirportDatis = APIAirportAtis
/// An airport's runway visual range now (/api/live/rvr, wingtip.rvr).
typealias AirportRvr = APIAirportRvr
typealias RunwayRvr = APIRunwayRvr
/// A ground stop, a delay program or a restriction (/api/live/flow).
typealias FlowProgram = APIFlowProgram
/// A special activity airspace's status from SFDPS (/api/live/saa).
typealias SaaStatus = APISaaStatus
/// A tower departure event (/api/live/departures, STDDS's TDES).
typealias DepartureEvent = APIDepartureEvent

extension Planner {
    static func liveAtis(_ airport: String) async throws -> AirportDatis {
        try await call { try await $0.digitalAtis(query: .init(airport: airport.uppercased())).ok.body.json }
    }

    static func liveRvr(_ airport: String) async throws -> AirportRvr {
        try await call { try await $0.runwayRvr(query: .init(airport: airport.uppercased())).ok.body.json }
    }

    static func liveFlow(_ airports: [String]) async throws -> [FlowProgram] {
        try await call { try await $0.flowPrograms(query: .init(airports: LiveWords.idents(airports).joined(separator: ","))).ok.body.json.programs }
    }

    /// Each area's status by its designator, as the planner names it.
    static func liveSaa(_ designators: [String]) async throws -> [String: SaaStatus] {
        let asked = Array(Set(designators.filter { !$0.isEmpty })).sorted()
        return try await call { try await $0.saaStatus(query: .init(designators: asked.joined(separator: ","))).ok.body.json.areas.additionalProperties }
    }

    /// A flight's tower departure events, newest first, by the ident it
    /// files under (its callsign, else its registration).
    static func liveDepartures(_ ident: String) async throws -> [DepartureEvent] {
        try await call { try await $0.departureEvents(query: .init(ident: ident.uppercased())).ok.body.json.events }
    }
}
