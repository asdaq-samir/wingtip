import Foundation

/// The nav log as the planner streams it (/api/navlog, newline-delimited
/// JSON, app.schemas.NavLogMessage): a "stage" line before each slow
/// piece of work, one "altitude" line once the altitudes are decided,
/// one "leg" line per leg, then "done" with the totals -- or "error"
/// where no route can be flown. Each line is one of the document's
/// schemas (NavLogStage, NavLogAltitude, NavLogLeg, NavLogDone,
/// NavLogError), generated as the rest are; only the choice among them by
/// `type` is made here, as the document's NavLogMessage is every line's
/// members at once.
enum NavLogMessage: Equatable, Sendable {
    case stage(String)
    case altitude(NavLogAltitude)
    case leg(Leg)
    case done(Totals)
    case error(NavLogError)
}

/// The altitude line: which plan is flown, at what, the four plans, the
/// figures for every legal altitude (the wheel's rows), the pilot's own
/// altitude's cautions, and the planner's reasoning (the selection).
typealias NavLogAltitude = APINavLogAltitude

/// One of the planner's four plans (AltitudeOption).
typealias AltitudeOption = APIAltitudeOption

extension AltitudeOption: Identifiable {
    var id: String { kind }
    /// The plan's highest altitude, the figure its row shows.
    var altitudeFt: Double? { steps.map(\.altitudeFt).max() }
}

typealias AltitudeStep = APIAltitudeStep

/// The flight's figures at one legal altitude (AltitudeFigure).
typealias AltitudeFigure = APIAltitudeFigure

extension AltitudeFigure: Identifiable {
    var id: Double { altitudeFt }
}

/// What is wrong with an altitude the pilot set (AltitudeCaution): a
/// warning, never a refusal.
typealias AltitudeCaution = APIAltitudeCaution

extension AltitudeCaution: Identifiable {
    var id: String { "\(fromIdent)-\(toIdent)" }
}

/// The planner's reasoning for the altitude (AltitudeBreakdown).
typealias AltitudeSelection = APIAltitudeBreakdown

/// One leg of the log, with the figures its row shows: its wind the
/// forecast's from true north (Wind), the procedure's path where one was
/// picked, where the climb tops out and the descent starts, and into a
/// stop landed at the minutes on the ground there (ground_min).
typealias Leg = APILeg

extension Leg: Identifiable, Hashable {
    var id: String { "\(from)-\(to)" }

    func hash(into hasher: inout Hasher) {
        hasher.combine(from)
        hasher.combine(to)
        hasher.combine(distanceNm)
        hasher.combine(altitudeFt)
    }
}

/// The flight's totals and its fuel check (navlog.totals, fuel_plan); its
/// fuelStops where each flight the tanks do not hold could land for fuel,
/// the whole chain at once (app.routers.plan.fuel_stops_of).
typealias Totals = APITotals

/// A field with fuel on the way (FuelStop).
typealias FuelStop = APIFuelStop

extension FuelStop: Identifiable {
    var id: String { ident }
}

/// The stops that take a flight from one landing to the next with the
/// reserve left (FuelStopSuggestion).
typealias FuelStopSuggestion = APIFuelStopSuggestion

extension FuelStopSuggestion: Identifiable {
    var id: String { "\(departure)-\(destination)" }
}

/// A way round what stops a route (Detour): a Class B's waypoint, or the
/// points round high ground (`via`), each before the stop at `stopIndex`.
typealias Detour = APIDetour

extension Detour: Identifiable {
    var id: String { ident }
}

typealias NavLogError = APINavLogError

extension NavLogError {
    /// A problem of the app's own, in the planner's shape.
    init(detail: String, brief: String?, reasons: [String]?, advice: String?) {
        self.init(advice: advice, brief: brief, classB: nil, detail: detail, detours: nil, reasons: reasons, retry: nil, type: nil)
    }
}


enum NavLog {
    /// One line of the stream, or nil for a line of a kind the app has no
    /// use for yet.
    static func decode(line: Data, decoder: JSONDecoder = Planner.snakeCase) throws -> NavLogMessage? {
        // Every line's `type`, the one member the document's NavLogMessage
        // gives them all.
        let kind = try decoder.decode(APINavLogMessage.self, from: line).type
        switch kind {
        case "stage": return .stage(try decoder.decode(APINavLogStage.self, from: line).detail)
        case "altitude": return .altitude(try decoder.decode(NavLogAltitude.self, from: line))
        case "leg": return .leg(try decoder.decode(Leg.self, from: line))
        case "done": return .done(try decoder.decode(APINavLogDone.self, from: line).totals)
        case "error": return .error(try decoder.decode(NavLogError.self, from: line))
        default: return nil
        }
    }

    /// The log for a route, line by line as the planner sends them.
    /// Thrown before anything is asked where the engine cannot write the
    /// procedures picked.
    static func stream(dep: String, dest: String, stops: [String], aircraft: String?, figures: Figures = Figures(), altitudeFt: Double?, nearest: Bool, choice: String?, procedures: [ProcedurePick] = [], extra: [String: String?] = [:]) throws -> AsyncThrowingStream<NavLogMessage, any Error> {
        var query = figures.query.merging(Planner.route(dep, dest, stops).merging([
            "aircraft": aircraft,
            // The procedures picked, which the legs are flown by and
            // the descents planned to.
            "procedures": procedures.isEmpty ? nil : try ProcedurePick.text(procedures),
            "altitude_ft": altitudeFt.map { String(Int($0)) },
            // Picked on the wheel: each leg at its nearest legal
            // altitude where the pick is one of the planner's.
            "altitude_nearest": altitudeFt != nil && nearest ? "true" : nil,
            // One of the four plans; fastest is the planner's own.
            "altitude_choice": choice.flatMap { $0 == "fastest" ? nil : $0 },
            // The rules kept (FlightRules): sent where IFR, VFR being the planner's default.
            "rules": FlightRules.saved() == .ifr ? "ifr" : nil,
        ]) { $1 }) { _, route in route }
        // The pilot's own edits of the route (RouteExtras): points'
        // altitudes, holds, crossings, a procedure flown direct.
        query.merge(extra) { _, own in own }
        let request = Planner.get("/api/navlog", query)
        return Planner.lines({ request }) { try decode(line: $0) }
    }
}
