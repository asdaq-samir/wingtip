import Foundation

/// The Brief's Go / No-Go as the planner works it out (POST
/// /api/go-no-go, app.gonogo): the web app's lib/verdict rules on the
/// planner, so the phone shows the answer and computes none of it. The
/// question is the route as the nav log was asked it and what only the
/// pilot knows; the answer is each finding, the line over them, and the
/// risk assessment and weight and balance the Brief's own pages show.
/// Every model is the planner's, generated from its OpenAPI document.

/// The pilot's personal minimums (app.gonogo.schemas.PersonalMinimums,
/// the web's lib/minimums): each nil, Off, until picked.
typealias PersonalMinimums = APIPersonalMinimums

extension PersonalMinimums {
    /// One minimum by its key, for the menus.
    enum Key: String, CaseIterable, Identifiable, Sendable {
        case ceilingFt, visibilitySm, crosswindKt, windKt
        var id: String { rawValue }

        /// Its row's title, as the web's MinimumsPanel names it.
        var title: String {
            switch self {
            case .ceilingFt: "Ceiling"
            case .visibilitySm: "Visibility"
            case .crosswindKt: "Crosswind"
            case .windKt: "Wind, with gusts"
            }
        }

        /// The choices it is picked from, the web's MINIMUM_CHOICES and the
        /// planner's (app.gonogo.minimums): menus, not sliders.
        var choices: [Double] {
            switch self {
            case .ceilingFt: [1000, 1500, 2000, 2500, 3000, 4000, 5000]
            case .visibilitySm: [3, 4, 5, 6, 8, 10]
            case .crosswindKt: [5, 8, 10, 12, 15, 17, 20]
            case .windKt: [10, 15, 20, 25, 30, 35]
            }
        }

        /// A choice as its menu reads: "1,500 ft", "5 sm", "12 kt".
        func words(_ value: Double) -> String {
            let n = Int(value.rounded())
            switch self {
            case .ceilingFt: return Format.altitude(value)
            case .visibilitySm: return "\(n) sm"
            case .crosswindKt, .windKt: return "\(n) kt"
            }
        }
    }

    subscript(key: Key) -> Double? {
        get {
            switch key {
            case .ceilingFt: ceilingFt
            case .visibilitySm: visibilitySm
            case .crosswindKt: crosswindKt
            case .windKt: windKt
            }
        }
        set {
            switch key {
            case .ceilingFt: ceilingFt = newValue
            case .visibilitySm: visibilitySm = newValue
            case .crosswindKt: crosswindKt = newValue
            case .windKt: windKt = newValue
            }
        }
    }
}

/// What the pilot loads (AirplaneLoad): the airplane's own empty weight
/// and arm, each station's pounds in the loading's order, and the fuel
/// at the start, gallons.
typealias AirplaneLoad = APIAirplaneLoad

/// POST /api/go-no-go's question (GoNoGoAsk), encoded in snake case:
/// the route as the nav log was asked it, then the pilot's own; `day` the
/// flight's day where the pilot is, "yyyy-MM-dd", the logbook's dates read
/// on it.
typealias GoNoGoAsk = APIGoNoGoAsk

/// The planner's OwnAirplane: the gateway's records of the airplane
/// flown, in the planner's names. The gateway works out each good-through
/// day (14 CFR 91.409, 91.411, 91.413, 91.207, 91.171); this only carries
/// them over.
typealias OwnAirplaneAsk = APIOwnAirplane

extension OwnAirplaneAsk {
    init(_ record: OwnAircraftRecord) {
        let i = record.inspections
        self.init(
            inspections: APIAirplaneInspections(
                annualGoodThrough: i.annualGoodThrough, eltBatteryDueOn: i.eltBatteryDueOn, eltInspectionGoodThrough: i.eltInspectionGoodThrough,
                hoursNow: i.hoursNow,
                // The 100-hour is owed only flown for hire (14 CFR 91.409(b)),
                // as the owner says: not one, not weighed (the web's lib/airworthiness).
                hundredHourDueAtHours: i.forHire ? i.hundredHourDueAtHours : nil,
                staticCheckGoodThrough: i.staticCheckGoodThrough, transponderCheckGoodThrough: i.transponderCheckGoodThrough),
            // Only the squawks still open: a fixed one grounds nothing.
            squawks: record.openSquawks.filter { $0.fixedOn == nil }.map {
                APIOpenSquawk(deferredFor: $0.deferredFor, inoperative: $0.inoperative, text: $0.text)
            },
            vorCheck: record.vorCheck.map { APIVorCheckInput(goodThrough: $0.goodThrough, withinLimit: $0.withinLimit) })
    }
}

/// What the findings come to, in a line (VerdictLine).
typealias VerdictLine = APIVerdictLine

/// One finding (VerdictItem): the weather, the TFRs and special use, the
/// altitude, the fuel, the runways, the weight and balance or the risk,
/// and where the web app says it in full.
typealias VerdictItem = APIVerdictItem

extension VerdictItem: @retroactive Identifiable {
    public var id: String { key }
}

/// What raised the risk (RiskFactor), with its mark.
typealias RiskFactor = APIRiskFactor

extension RiskFactor: @retroactive Identifiable {
    public var id: String { key }
    /// What it adds, as the web's row says it: "No-go" or "+3".
    var value: String { stop == true ? "No-go" : "+\(points)" }
}

/// A check only the pilot can answer (RiskCheck), in its group.
typealias RiskCheck = APIRiskCheck

extension RiskCheck: @retroactive Identifiable {
    public var id: String { key }
    var value: String { stop == true ? "No-go" : "+\(points)" }
}

/// The risk assessment (RiskAssessment): its line, what to do at its
/// level, and every factor counted.
typealias RiskAssessment = APIRiskAssessment

/// One of the loading's stations (LoadingStation).
typealias LoadingStation = APILoadingStation

/// The airplane's POH loading (Loading).
typealias PohLoading = APILoading

typealias LoadCondition = APILoadCondition

extension LoadCondition {
    /// "2,407 lb · 41.2 in", as the web's Balance rows.
    var words: String {
        "\(Format.grouped(weightLb)) lb · \(Format.number(armIn, decimals: 1)) in"
    }
}

/// The weight and balance worked out for the load used (LoadBalance).
typealias LoadBalance = APILoadBalance

/// POST /api/go-no-go's answer (GoNoGo).
typealias GoNoGoAnswer = APIGoNoGo

extension Planner {
    /// The Go / No-Go for the route (POST /api/go-no-go).
    static func goNoGo(_ ask: GoNoGoAsk) async throws -> GoNoGoAnswer {
        try await call { try await $0.goNoGo(body: .json(ask)).ok.body.json }
    }
}
