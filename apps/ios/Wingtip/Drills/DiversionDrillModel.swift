import Foundation
import Observation

/// The diversion drill's view model (DiversionDrillView, MVVM, ACS
/// PA.VI.C): the clock, the nearest fields to pick from, the estimates
/// typed and the planner's check of them. Every failure is said where it
/// happened; nothing is put in its place -- no altitude assumed, no
/// "no fields near here" where they couldn't be asked.
@MainActor
@Observable
final class DiversionDrillModel {
    /// The altitudes the drill can be flown at, VFR's: below 18,000 ft
    /// MSL, the floor of Class A (14 CFR 71.33), the engine's.
    let altitudes = Result { try Altitudes.vfr(from: 1500) }

    var started: Date?
    var stopped: Date?
    private(set) var from: OwnShip.Fix?
    private(set) var fields: [NearestAirport] = []
    private(set) var finding = false
    /// The fields' failure, under them.
    private(set) var fieldsProblem: String?
    var chosen: String?
    var typed: [String: String] = [:]
    /// The altitude flown; nil until there is one to start from or the
    /// pilot picks one, never a stock altitude.
    var altitudeFt: Double?
    private(set) var answer: DiversionAnswer?
    private(set) var checking = false
    private(set) var problem: String?

    var checked: Bool { stopped != nil }

    /// The plan's cruise to start with, else the airplane's own altitude
    /// to the nearest 500 ft, each the nearest of the engine's altitudes:
    /// a choice to change, no rule. With neither, none is picked for the
    /// pilot.
    func startingAltitude(planFt: Double?, fix: OwnShip.Fix?) {
        guard altitudeFt == nil, let own = planFt ?? fix?.altitudeFt.map({ ($0 / 500).rounded() * 500 }),
              let list = try? altitudes.get() else { return }
        altitudeFt = list.min { abs($0 - own) < abs($1 - own) }
    }

    /// The clock started from `fix`, and the nearest fields asked for.
    func start(at fix: OwnShip.Fix?) {
        started = Date(); stopped = nil; chosen = nil; typed = [:]; answer = nil; problem = nil; fieldsProblem = nil
        from = fix
        guard let at = fix?.coordinate else { return }
        finding = true
        Task {
            defer { finding = false }
            do {
                // A field under the point is where the airplane is, not a diversion.
                let near = try await Planner.nearest(lat: at.latitude, lon: at.longitude, limit: 10)
                fields = Array(near.filter { $0.distanceNm >= 2 }.prefix(6))
            } catch {
                fields = []
                fieldsProblem = "The nearest fields couldn't be found: \(error.localizedDescription)"
            }
        }
    }

    /// The estimates checked against the planner's solution.
    func check(aircraft: String?, figures: Figures) {
        guard let ident = chosen, let at = from?.coordinate, let altitude = altitudeFt else { return }
        let estimates = typed.compactMapValues { Double($0.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)) }
        stopped = Date()
        checking = true
        Task {
            defer { checking = false }
            do {
                answer = try await Planner.diversion(lat: at.latitude, lon: at.longitude, to: ident, altitudeFt: altitude,
                                                     aircraft: aircraft, figures: figures, estimates: estimates)
                problem = nil
            } catch {
                problem = "The diversion could not be worked out: \(error.localizedDescription)"
                stopped = nil
            }
        }
    }
}
