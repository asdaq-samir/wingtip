import Foundation
import Observation
import PlannerAPI

/// The diversion drill's view model (DiversionDrillView, MVVM, ACS
/// PA.VI.C): the clock, the fields to pick from in the engine's order for
/// a diversion, the estimates typed and the planner's check of them. Every failure is said where it
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
    /// The fields round, best for a diversion first (best_fields).
    private(set) var fields: [Emergency.Field] = []
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

    /// The clock started from `fix`, and the fields round asked for: the
    /// planner's nearest with their runways, METARs and use (the
    /// emergency's /api/emergency/fields), ranked by the engine's
    /// best_fields in "diversion" mode, where a private or military-only
    /// field counts against it as an IFR report does (no emergency, so
    /// the owner's or the service's permission stands; 14 CFR 91.3(b) is
    /// for one) and a closed one is never ranked (decision 0043).
    func start(at fix: OwnShip.Fix?, aircraft: String?) {
        started = Date(); stopped = nil; chosen = nil; typed = [:]; answer = nil; problem = nil; fieldsProblem = nil
        from = fix
        guard let at = fix?.coordinate else { return }
        finding = true
        Task {
            defer { finding = false }
            do {
                let asked = Operations.EmergencyFields.Input.Query(lat: at.latitude, lon: at.longitude, altitudeFt: altitudeFt,
                                                                   aircraft: aircraft, glideRatio: nil)
                let near = try await Planner.call { try await $0.emergencyFields(query: asked).ok.body.json }
                guard let fix else { return }
                fields = try Self.ranked(near, fix: fix)
            } catch {
                fields = []
                fieldsProblem = "The nearest fields couldn't be found: \(error.localizedDescription)"
            }
        }
    }

    /// The fields to divert to, at most six, best first: a field under the
    /// point (within 2 nm) is where the airplane is, not a diversion.
    static func ranked(_ near: APIEmergencyFields, fix: OwnShip.Fix) throws -> [Emergency.Field] {
        var away = near
        away.fields = near.fields.filter { $0.distanceNm >= 2 }
        let ranked = try Emergency.bestFields(away, fix: fix, variationDeg: Emergency.variation(at: fix.coordinate), mode: "diversion")
        return Array(ranked.fields.prefix(6))
    }

    /// A row's runway and weather: "3,200 ft runway · VFR".
    static func detail(_ field: Emergency.Field) -> String {
        [field.runway?.lengthFt.map { "\(Format.altitude($0)) runway" } ?? "no runway length",
         field.flightCategory ?? "no weather report"].joined(separator: " · ")
    }

    /// A row's use, the engine's: Private, Military or Joint use.
    static func flag(_ field: Emergency.Field) -> FieldUse.Flag? {
        FieldUse.flag(closed: nil, use: FieldUse.code(isPrivate: field.private, military: field.military))
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
