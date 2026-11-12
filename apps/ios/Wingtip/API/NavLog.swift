import Foundation
import PlannerAPI

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

extension AltitudeOption: @retroactive Identifiable {
    public var id: String { kind }
    /// The plan's highest altitude, the figure its row shows.
    var altitudeFt: Double? { steps.map(\.altitudeFt).max() }
}

typealias AltitudeStep = APIAltitudeStep

/// The flight's figures at one legal altitude (AltitudeFigure).
typealias AltitudeFigure = APIAltitudeFigure

extension AltitudeFigure: @retroactive Identifiable {
    public var id: Double { altitudeFt }
}

/// What is wrong with an altitude the pilot set (AltitudeCaution): a
/// warning, never a refusal.
typealias AltitudeCaution = APIAltitudeCaution

extension AltitudeCaution: @retroactive Identifiable {
    public var id: String { "\(fromIdent)-\(toIdent)" }
}

/// The planner's reasoning for the altitude (AltitudeBreakdown).
typealias AltitudeSelection = APIAltitudeBreakdown

/// One leg of the log, with the figures its row shows: its wind the
/// forecast's from true north (Wind), the procedure's path where one was
/// picked, where the climb tops out and the descent starts, and into a
/// stop landed at the minutes on the ground there (ground_min).
typealias Leg = APILeg

extension Leg: @retroactive Identifiable {
    public var id: String { "\(from)-\(to)" }
}

/// The flight's totals and its fuel check (navlog.totals, fuel_plan); its
/// fuelStops where each flight the tanks do not hold could land for fuel,
/// the whole chain at once (app.routers.plan.fuel_stops_of).
typealias Totals = APITotals

/// A field with fuel on the way (FuelStop).
typealias FuelStop = APIFuelStop

extension FuelStop: @retroactive Identifiable {
    public var id: String { ident }
}

/// The stops that take a flight from one landing to the next with the
/// reserve left (FuelStopSuggestion).
typealias FuelStopSuggestion = APIFuelStopSuggestion

extension FuelStopSuggestion: @retroactive Identifiable {
    public var id: String { "\(departure)-\(destination)" }
}

/// A way round what stops a route (Detour): a Class B's waypoint, or the
/// points round high ground (`via`), each before the stop at `stopIndex`.
typealias Detour = APIDetour

extension Detour: @retroactive Identifiable {
    public var id: String { ident }
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
    static func decode(line: Data, decoder: JSONDecoder = Planner.json) throws -> NavLogMessage? {
        // Every line's `type`, the member the document's NavLogMessage
        // tells its lines apart by; each line is then read as its own.
        struct Kind: Decodable { let type: String }
        switch try decoder.decode(Kind.self, from: line).type {
        case "stage": return .stage(try decoder.decode(APINavLogStage.self, from: line).detail)
        case "altitude": return .altitude(try decoder.decode(NavLogAltitude.self, from: line))
        case "leg": return .leg(try decoder.decode(Leg.self, from: line))
        case "done": return .done(try decoder.decode(APINavLogDone.self, from: line).totals)
        case "error": return .error(try decoder.decode(NavLogError.self, from: line))
        default: return nil
        }
    }

    /// The log for a route, line by line as the planner sends them.
    /// `extra` is the query with the pilot's own edits of the route
    /// (RouteExtras.apply): points' altitudes, holds, crossings, a
    /// procedure flown direct. Thrown before anything is asked where the
    /// engine cannot write the procedures picked.
    static func stream(dep: String, dest: String, stops: [String], aircraft: String?, figures: Figures = Figures(), altitudeFt: Double?, nearest: Bool,
                       choice: String?, procedures: [ProcedurePick] = [], extra: NavLogQuery? = nil) throws -> AsyncThrowingStream<NavLogMessage, any Error> {
        let asked = try query(dep: dep, dest: dest, stops: stops, aircraft: aircraft, figures: figures, altitudeFt: altitudeFt, nearest: nearest,
                              choice: choice, procedures: procedures, extra: extra)
        return Planner.lines({ try await Planner.call(.read) { try await $0.navlogStream(query: asked).ok.body.any } }) { try decode(line: $0) }
    }

    /// The nav log's question: the route, the airplane and its figures
    /// set, the altitude picked, and the pilot's own edits.
    static func query(dep: String, dest: String, stops: [String], aircraft: String?, figures: Figures = Figures(), altitudeFt: Double?, nearest: Bool,
                      choice: String?, procedures: [ProcedurePick] = [], extra: NavLogQuery? = nil) throws -> NavLogQuery {
        var query = extra ?? NavLogQuery(dep: dep, dest: dest)
        query.dep = dep
        query.dest = dest
        query.stops = Planner.stops(stops)
        query.aircraft = aircraft
        // The procedures picked, which the legs are flown by and the
        // descents planned to, unless an edit wrote them flown direct.
        if query.procedures == nil, !procedures.isEmpty { query.procedures = try ProcedurePick.text(procedures) }
        query.altitudeFt = altitudeFt?.rounded(.towardZero)
        // Picked on the wheel: each leg at its nearest legal altitude
        // where the pick is one of the planner's.
        query.altitudeNearest = altitudeFt != nil && nearest ? true : nil
        // One of the four plans; fastest is the planner's own.
        query.altitudeChoice = choice.flatMap { $0 == "fastest" ? nil : $0 }
        // The rules kept (FlightRules): sent where IFR, VFR being the planner's default.
        query.rules = FlightRules.saved() == .ifr ? "ifr" : nil
        // The pilot's own figures, which an airplane of no stock type flies on.
        query.cruiseTasKt = figures.cruiseTasKt
        query.fuelBurnGph = figures.fuelBurnGph
        query.usableFuelGal = figures.usableFuelGal
        query.cruisePowerPct = figures.cruisePowerPct
        query.climbTasKt = figures.climbTasKt
        query.climbFuelBurnGph = figures.climbFuelBurnGph
        query.serviceCeilingFt = figures.serviceCeilingFt
        query.climbRateFpm = figures.climbRateFpm
        query.taxiFuelGal = figures.taxiFuelGal
        query.glideRatio = figures.glideRatio
        return query
    }
}

/// The nav log's question (GET /api/navlog), as its generated client takes it.
typealias NavLogQuery = Operations.NavlogStream.Input.Query
