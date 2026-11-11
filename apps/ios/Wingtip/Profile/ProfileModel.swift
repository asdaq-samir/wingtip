import Foundation
import Observation

/// The Profile card's view model (MVVM, one per screen): the altitude the
/// slider previews, Auto in flight, the waypoint whose popover is up, and
/// the plan changed only on Set or a row of the Altitude Advisor (the
/// owner's spec of 2026-11-10). The engine answers every figure
/// (ProfileRules); this holds what the pilot is doing with them.
@MainActor
@Observable
final class ProfileModel {
    /// The altitude previewed on the slider, feet MSL; nil, the plan's.
    var previewFt: Double?
    /// In flight, the preview follows the airplane's own altitude.
    var auto = false
    /// The waypoint tapped in the profile, its popover up.
    var waypoint: String?

    /// The altitude the profile colours the ground against: the
    /// airplane's under Auto, else the preview, else the plan's.
    func shownFt(plan: Plan, airplaneFt: Double?) -> Double? {
        if auto, let airplaneFt { return airplaneFt }
        return previewFt ?? plan.altitudeFt
    }

    /// Whether Set has something to fly: a preview other than the plan's.
    func changed(plan: Plan) -> Bool {
        guard let previewFt, !auto else { return false }
        return previewFt != plan.altitudeFt
    }

    /// The slider moved by the pilot: a preview, and Auto off.
    func preview(_ ft: Double) {
        auto = false
        previewFt = ft
    }

    /// Set: the preview flown, as a row of the advisor would be.
    func set(plan: Plan, rows: [ProfileRules.AdvisorRow]) {
        guard let previewFt else { return }
        fly(previewFt, plan: plan, rows: rows)
    }

    /// An altitude flown: a plan's where it is one's (the planner flies
    /// its steps), else the pilot's own, at each leg's nearest legal
    /// altitude where it is legal and as it stands where it is not (warn,
    /// never limit).
    func fly(_ ft: Double, plan: Plan, rows: [ProfileRules.AdvisorRow]) {
        if let option = plan.altitude?.options?.first(where: { $0.altitudeFt == ft && !$0.steps.isEmpty }) {
            plan.ownAltitudeFt = nil
            plan.altitudeChoice = option.kind
        } else {
            plan.altitudeChoice = nil
            plan.ownAltitudeFt = ft
            plan.ownAltitudeLegal = rows.first { $0.altitudeFt == ft }?.legal ?? false
        }
        previewFt = nil
        auto = false
        Feel.tap(.altitude)
        plan.plan()
    }

    /// A waypoint's own altitude, with where its climb or descent sits:
    /// begun at the waypoint (Start At) or done by it (Cross At); nil
    /// gives the leg the plan's again.
    func setLeg(_ ident: String, feet: Int?, mode: LegAltitudeMode, plan: Plan) {
        plan.setAltitude(at: ident, feet: feet, mode: mode)
        Feel.tap(.altitude)
        waypoint = nil
    }
}

/// Where a waypoint's altitude change is flown, as ForeFlight's profile
/// asks it: the climb or descent begins at the waypoint, or is done by it.
enum LegAltitudeMode: String, CaseIterable, Identifiable, Sendable {
    /// The engine's words for them (`altitude_change`'s mode).
    case startAt = "start_at"
    case crossAt = "cross_at"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .startAt: "Start At"
        case .crossAt: "Cross At"
        }
    }
}
