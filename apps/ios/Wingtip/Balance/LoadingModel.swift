import Foundation
import Observation

/// The Weight & Balance page's model: the airplane's loading weighed on
/// the device as the pilot types, by the engine's own gonogo_balance (the
/// planner's, the web's lib/weightBalance), so the envelope's points move
/// with each figure, with no signal too. The loading is the POH's the
/// planner sent with the Go / No-Go (the airplane's limits, stations, fuel
/// and envelope); the load the pilot's, kept for the airplane (Verdict).
/// Nothing is worked out here: the weights, the arms and what is out of
/// limits are the engine's (14 CFR 91.9(a): the airplane flown within the
/// limitations its manual gives).
@MainActor
@Observable
final class LoadingModel {
    typealias Balance = EngineContract.GonogoBalanceAnswer

    /// A point on the envelope's graph: weight up, arm across.
    struct Point: Identifiable, Equatable {
        let armIn: Double
        let weightLb: Double
        let id: Int
    }

    /// The engine's balance for the load now; nil before one is weighed
    /// or where it refused (problem).
    private(set) var balance: Balance?
    /// Why it could not be weighed, said where it happened.
    private(set) var problem: String?
    /// The grades of fuel and each one's weight a gallon, the engine's
    /// (FAA-H-8083-1B: avgas 6.0, Jet A 6.8 lb/gal), for the fuel's menu;
    /// none where the engine refused, said as the page's problem.
    let grades: [EngineContract.FuelGradesAnswerItem]

    init() {
        do {
            grades = try Engine.fuelGrades()
        } catch {
            grades = []
            problem = Problems.say("The fuel grades could not be read", error)
        }
    }

    /// The grade the pilot picked for this airplane's fuel, kept on the
    /// device by its loading's key; nil, the POH's own figure.
    func grade(for key: String) -> String? { UserDefaults.standard.string(forKey: "fuelGrade." + key) }

    func setGrade(_ grade: String?, for key: String) {
        UserDefaults.standard.set(grade, forKey: "fuelGrade." + key)
    }

    /// The pounds a gallon of the grade weighs; nil, none picked.
    func lbPerGal(_ grade: String?) -> Double? { grades.first { $0.grade == grade }?.lbPerGal }

    /// Weighs `load` against `loading`, the trip's fuel burnt by landing.
    /// The fuel weighed at `lbPerGal` where a grade is picked, else at the
    /// POH's figure.
    func weigh(_ loading: PohLoading, load: AirplaneLoad, tripFuelGal: Double?, lbPerGal: Double? = nil) {
        var loading = loading
        if let lbPerGal { loading.fuelLbPerGal = lbPerGal }
        do {
            balance = try Self.balance(loading, load: load, tripFuelGal: tripFuelGal)
            problem = nil
        } catch {
            balance = nil
            problem = Problems.say("The weight and balance could not be worked out", error)
        }
    }

    /// The engine's answer: the planner's loading read as the engine's
    /// contract has it (the same members, snake case), and the load.
    nonisolated static func balance(_ loading: PohLoading, load: AirplaneLoad, tripFuelGal: Double?) throws -> Balance {
        let asked: EngineContract.GonogoLoading = try Engine.recoded(loading, encoder: Planner.snakeEncoder)
        let aboard = EngineContract.GonogoLoad(emptyWeightLb: load.emptyWeightLb, emptyArmIn: load.emptyArmIn,
                                               stationsLb: load.stationsLb.map { Optional($0) }, fuelGal: load.fuelGal)
        return try Engine.gonogoBalance(loading: asked, load: aboard, tripFuelGal: tripFuelGal)
    }

    /// The POH's envelope as drawn: its corners in order and back to the
    /// first, so the outline closes, as the web's EnvelopeChart draws it.
    nonisolated static func outline(_ loading: PohLoading) -> [Point] {
        let corners = loading.envelope.filter { $0.count == 2 }
        guard let first = corners.first else { return [] }
        return (corners + [first]).enumerated().map { Point(armIn: $1[0], weightLb: $1[1], id: $0) }
    }

    /// The takeoff and landing points, each where it has a centre of
    /// gravity (none at zero weight).
    nonisolated static func loaded(_ balance: Balance) -> (takeoff: Point?, landing: Point?) {
        let point = { (arm: Double?, weight: Double, id: Int) in arm.map { Point(armIn: $0, weightLb: weight, id: id) } }
        return (point(balance.takeoff.armIn, balance.takeoff.weightLb, 0), point(balance.landing.armIn, balance.landing.weightLb, 1))
    }

    /// The graph's room: the envelope and the points with an inch either
    /// side across and a hundred pounds above and below, at round figures
    /// (the web's EnvelopeChart's domains).
    nonisolated static func domains(_ points: [Point]) -> (arm: ClosedRange<Double>, weight: ClosedRange<Double>)? {
        guard let arms = points.map(\.armIn).minMax, let weights = points.map(\.weightLb).minMax else { return nil }
        return ((arms.min.rounded(.down) - 1)...(arms.max.rounded(.up) + 1),
                ((weights.min / 100).rounded(.down) * 100 - 100)...((weights.max / 100).rounded(.up) * 100 + 100))
    }
}

private extension Array where Element == Double {
    var minMax: (min: Double, max: Double)? {
        guard let lo = self.min(), let hi = self.max() else { return nil }
        return (lo, hi)
    }
}
