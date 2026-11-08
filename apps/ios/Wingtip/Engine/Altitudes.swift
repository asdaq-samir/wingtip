import Foundation

/// The altitudes a flight may be planned at and an altitude as ATC says
/// it, asked of the engine by name (its `vfr_altitudes`, `altitude_allowed`
/// and `altitude_said`), as the web's wheel and clearance card ask them:
/// Class A's floor at 18,000 ft MSL (14 CFR 71.33, 91.135), 17,500 ft the
/// highest VFR cruising altitude (91.159(a)), FL410 IFR's (91.179(b)(4)),
/// 500 ft the least (91.119(c)), flight levels from 18,000 ft (91.121(a)(2),
/// AIM 4-2-9).
enum Altitudes {
    /// Every 500 ft from `from` to 17,500 ft.
    static func vfr(from: Double = 1000) -> [Double] {
        (try? Engine.call("vfr_altitudes", json: ["from_ft": from])) ?? []
    }

    /// Whether an altitude asked for may be planned.
    static func allowed(_ ft: Double, ifr: Bool = false) -> Bool {
        (try? Engine.call("altitude_allowed", json: ["ft": ft, "ifr": ifr])) ?? false
    }

    /// "5,500 ft" below 18,000 ft, "FL180" from there up.
    static func said(_ ft: Double) -> String {
        (try? Engine.call("altitude_said", json: ["ft": ft])) ?? "\(Int(ft)) ft"
    }
}
