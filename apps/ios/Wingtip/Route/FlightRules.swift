import Foundation

/// The flight rules every route is planned under, kept on this phone: the
/// web's `flightRules` preference ("vfr" or "ifr", lib/preferences), sent
/// to the planner's nav log as `rules` where IFR, as the web's client
/// sends it: the planner then plans 14 CFR 91.177's minimum altitudes,
/// 91.179's by direction and 91.167's reserve (app/plan_query.py). Set in
/// the Profile's Altitude, its home as the web's altitude popover is.
enum FlightRules: String, CaseIterable, Identifiable, Sendable {
    case vfr, ifr

    static let key = "flightRules"

    var id: String { rawValue }
    var label: String { rawValue.uppercased() }

    /// The rules kept, VFR until the pilot picks IFR.
    static func saved(_ defaults: UserDefaults = .standard) -> FlightRules {
        FlightRules(rawValue: defaults.string(forKey: key) ?? "") ?? .vfr
    }
}
