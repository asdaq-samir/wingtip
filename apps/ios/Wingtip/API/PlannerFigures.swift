import Foundation
import PlannerAPI

/// The figures the web app works out on its pages. A hold's entry and
/// wind and lost communications' altitudes need nothing but what the
/// pilot types, so the engine works them out on the phone, with no
/// network (the generated Engine.holding and Engine.lostComms, the same
/// code that answers the planner's /api/holding and /api/lost-comms). A
/// flown track's debrief (POST /api/debrief) needs the fields' pattern
/// altitudes and the diversion drill (GET /api/diversion) the leg's winds
/// aloft and variation, which the planner looks up, so those two stay the
/// planner's (app.figures, the same engine code again). Every model here
/// is generated: the planner's from its OpenAPI document (API prefix), the
/// engine's from its contract (EngineContract).

// MARK: - The debrief

/// A saved flight with its nav log (the gateway's FlightDto): what its
/// debrief is read against.
typealias SavedFlightDetail = GWFlightDto

/// POST /api/debrief's question and answer: the flight's checkpoints and
/// the track's points, sent in snake case (sequence_no, alt_ft…).
typealias DebriefAsk = APIDebriefAsk
typealias DebriefAnswer = APIDebriefAnswer
typealias Debrief = APIDebrief
typealias LegGrade = APILegGrade
typealias CheckpointPass = APICheckpointPass
typealias PatternEntry = APIPatternEntry
/// ACS PA.VI.A's and PA.III.B's tolerances, the planner's, for headings.
typealias DebriefTolerances = APIDebriefTolerances

// MARK: - The diversion drill

typealias DiversionAnswer = APIDiversion
typealias DiversionSolved = APIDiversionSolved
/// A student's estimate against the exact figure (EstimateCheck).
typealias EstimateCheck = APIEstimateCheck

// MARK: - Holding and lost communications, the engine's

typealias HoldingAnswer = EngineContract.HoldingAnswer
typealias LostCommsAnswer = EngineContract.LostCommsAnswer
typealias LostCommsRoute = EngineContract.LostCommsAnswerRoutesItem
typealias FlownSegment = EngineContract.LostCommsAnswerSegmentsItem

// MARK: - The calls

extension Planner {
    /// A flight's track debriefed against its nav log (POST /api/debrief):
    /// the gateway's checkpoints and points are the planner's by name, the
    /// gateway's camel case written in the planner's snake case.
    static func debrief(checkpoints: [GWFlightCheckpointDto], points: [SavedTrackPoint]) async throws -> DebriefAnswer {
        let snake = Planner.snakeEncoder
        let ask = DebriefAsk(checkpoints: try checkpoints.map { try Engine.recoded($0, encoder: snake) }, points: try points.map { try Engine.recoded($0, encoder: snake) })
        return try await call { try await $0.debrief(body: .json(ask)).ok.body.json }
    }

    /// The diversion from a point to a field in the planner's air there,
    /// the student's estimates checked where given (GET /api/diversion):
    /// `mh`, `gs`, `ete` and `fuel`, the estimates' names.
    static func diversion(lat: Double, lon: Double, to ident: String, altitudeFt: Double, aircraft: String?, figures: Figures,
                          estimates: [String: Double]) async throws -> DiversionAnswer {
        let query = Operations.Diversion.Input.Query(
            lat: lat, lon: lon, to: ident, altitudeFt: altitudeFt.rounded(), aircraft: aircraft, cruiseTasKt: figures.cruiseTasKt,
            fuelBurnGph: figures.fuelBurnGph, cruisePowerPct: figures.cruisePowerPct,
            mh: estimates["mh"], gs: estimates["gs"], ete: estimates["ete"], fuel: estimates["fuel"])
        return try await call { try await $0.diversion(query: query).ok.body.json }
    }
}

extension Gateway {
    /// One of the pilot's saved flights with its nav log (/api/flights/{id}).
    static func flightDetail(_ id: Int) async throws -> SavedFlightDetail {
        try await call { try await $0.getFlightsId(path: .init(id: id)).ok.body.json }
    }
}
