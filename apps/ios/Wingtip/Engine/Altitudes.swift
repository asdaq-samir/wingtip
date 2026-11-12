import Foundation

/// The altitudes a flight may be planned at and an altitude as ATC says
/// it, asked of the engine by name (its `vfr_altitudes`, `altitude_allowed`
/// and `altitude_said`), as the web's wheel and clearance card ask them:
/// Class A's floor at 18,000 ft MSL (14 CFR 71.33, 91.135), 17,500 ft the
/// highest VFR cruising altitude (91.159(a)), FL410 IFR's (91.179(b)(4)),
/// 500 ft the least (91.119(c)), flight levels from 18,000 ft (91.121(a)(2),
/// AIM 4-2-9). Each throws where the engine cannot answer, so no altitude
/// is offered or accepted on a guess.
enum Altitudes {
    /// Every 500 ft from `from` to 17,500 ft.
    static func vfr(from: Double = 1000) throws -> [Double] {
        try Engine.vfrAltitudes(fromFt: from)
    }

    /// Whether an altitude asked for may be planned.
    static func allowed(_ ft: Double, ifr: Bool = false) throws -> Bool {
        try Engine.altitudeAllowed(ft: ft, ifr: ifr)
    }

    /// "5,500 ft" below 18,000 ft, "FL180" from there up. Where the engine
    /// refuses (logged by Engine.rule), its problem in the altitude's
    /// place, as FlightWords' squawk does: feet written plainly above
    /// 18,000 ft would be an altitude ATC never says.
    static func said(_ ft: Double) -> String {
        do { return try Engine.altitudeSaid(ft: ft) } catch { return "altitude couldn't be worked out: \(error.localizedDescription)" }
    }
}
