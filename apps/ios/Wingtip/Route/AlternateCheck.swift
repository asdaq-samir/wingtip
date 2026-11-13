import Foundation
import Observation

/// Under IFR, the alternate, as the web's useAlternate asks it: the
/// planner's GET /api/alternate for the destination at the nav log's ETA,
/// the way on flown at the picked airplane's cruise. The planner hands
/// the engine its rules -- `ifr_alternate_window` (the destination's TAF
/// an hour either side of the ETA, 14 CFR 91.169(b)(2)(i); an alternate's
/// at its ETA, 91.169(c)), `ifr_alternate_destination` (the "1-2-3") and
/// `ifr_alternate_check` (600-2 with a precision approach, 800-2 without,
/// or the field's own published minimums) -- and the answer is shown as it
/// comes, its reasons in the engine's words. One model for the Brief's
/// Alternate section, the plan's Alternate row and the map's ↓ on the
/// alternates (FieldWeatherState).
@MainActor
@Observable
final class AlternateCheck {
    /// The planner's answer for the question last asked; nil before one.
    private(set) var answer: APIAlternates?
    /// Why there is no answer to ask for yet, in words: VFR, no ETA, no
    /// airplane to fly the way on at.
    private(set) var waiting: String?
    private(set) var problem: String?
    private(set) var asking = false
    /// Whether the wait is for an airplane, so the section can ask for one.
    private(set) var needsAirplane = false
    private var asked: Ask?

    /// What the planner is asked: the destination, the ETA there and the
    /// cruise the way on is flown at, and the alternate filed.
    struct Ask: Equatable, Sendable {
        var dest: String
        var eta: Date
        var tasKt: Double
        var alternate: String
    }

    /// The question for the plan on the page, or why there is none: under
    /// IFR only; the ETA the nav log's (the iPhone's plan keeps no
    /// departure time, so from when it was planned, as ForecastRun takes
    /// it); the airplane's own cruise, never a stock one's (docs/decisions/
    /// 0011).
    static func ask(for plan: Plan, rules: FlightRules = .saved()) -> Result<Ask, Waiting> {
        guard rules == .ifr else { return .failure(.vfr) }
        guard plan.routed, let ete = plan.totals?.eteMin else { return .failure(.noEta) }
        guard plan.airplaneChosen, let tas = plan.altitude?.aircraft?.cruiseTasKt, tas > 0 else { return .failure(.noAirplane) }
        let eta = (plan.plannedAt ?? Date()).addingTimeInterval(ete * 60)
        return .success(Ask(dest: plan.dest.uppercased(), eta: eta, tasKt: tas, alternate: plan.extras.alternate ?? ""))
    }

    /// Why the alternate is not asked for, said where it would be.
    enum Waiting: Error, Equatable {
        case vfr, noEta, noAirplane

        var words: String? {
            switch self {
            case .vfr: nil
            case .noEta: "Checked once the nav log has an ETA."
            case .noAirplane: "Pick an airplane: the alternate is timed at its cruise speed."
            }
        }
    }

    /// The plan's key for asking again: its question, or its reason.
    static func key(for plan: Plan) -> String {
        switch ask(for: plan) {
        case .success(let ask): "\(ask.dest)|\(Int(ask.eta.timeIntervalSince1970 / 60))|\(ask.tasKt)|\(ask.alternate)"
        case .failure(let why): "\(why)"
        }
    }

    /// Asks the planner where the question changed.
    func refresh(plan: Plan) async {
        switch Self.ask(for: plan) {
        case .failure(let why):
            answer = nil; problem = nil; asked = nil
            waiting = why.words
            needsAirplane = why == .noAirplane
        case .success(let ask):
            waiting = nil; needsAirplane = false
            guard ask != asked || answer == nil else { return }
            await fetch(ask)
        }
    }

    private func fetch(_ ask: Ask) async {
        asking = true
        defer { asking = false }
        do {
            let fresh = try await Planner.call {
                try await $0.alternate(query: .init(dest: ask.dest, eta: ISO8601DateFormatter().string(from: ask.eta), tasKt: ask.tasKt.rounded(),
                                                    alternate: ask.alternate.isEmpty ? nil : ask.alternate)).ok.body.json
            }
            guard !Task.isCancelled else { return }
            answer = fresh
            asked = ask
            problem = nil
        } catch {
            guard !Task.isCancelled else { return }
            // Said where the alternate is shown; the last answer is not
            // kept for a question it was not the answer to.
            answer = nil
            problem = "The alternate couldn't be checked: \(error.localizedDescription)"
            Log.planner.notice("the alternate check failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: For the map's ↓

    /// The alternates' forecasts at the ETA there, as weather_worse reads
    /// a later reading: the one filed and those offered, each the TAF's
    /// worst at its ETA the planner gave (91.169(c)'s window). With no
    /// ceiling forecast, none is sent rather than a guessed one.
    var atEta: [EngineContract.WorseField] {
        guard let answer else { return [] }
        let checks = (answer.alternate.map { [$0] } ?? []) + (answer.suggestions ?? [])
        var seen = Set<String>()
        return checks.compactMap { check in
            guard seen.insert(check.ident).inserted, check.ceilingFt != nil || check.visibilitySm != nil else { return nil }
            return EngineContract.WorseField(ident: check.ident, ceilingFt: check.ceilingFt, visibilitySm: check.visibilitySm,
                                             ceilingUnknown: nil, arrival: true)
        }
    }
}
