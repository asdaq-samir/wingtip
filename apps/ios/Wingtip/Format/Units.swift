import Foundation

/// The unit constants the app needs, one copy each and nowhere else
/// (scripts/ci/simplicity_ratchet.py's phone_unit_literals counts a unit
/// literal outside this file). A length is converted by Foundation's
/// Measurement and UnitLength, whose foot (0.3048 m), statute mile
/// (1,609.344 m) and nautical mile (1,852 m) are the exact definitions;
/// this holds only what Foundation has no exact unit for, worked out from
/// those definitions as the engine's core::units is: the international
/// foot and nautical mile of the 1959 yard and pound agreement (NIST SP
/// 811 B.9) and the statute mile of 5,280 of those feet.
enum Units {
    /// Metres in a nautical mile, the international nautical mile (NIST SP
    /// 811 B.9).
    nonisolated static let mPerNm = 1852.0
    /// Feet in a statute mile (NIST SP 811 B.9): 91.155(a)'s "1 statute
    /// mile" from clouds, which the planner sends in feet.
    nonisolated static let ftPerSm = 5280.0
    /// Knots in a metre a second: 3,600 s an hour over 1,852 m a mile,
    /// 1.943844492.... Not UnitSpeed.knots, whose metre a second is the
    /// rounded 0.514444 m/s a knot.
    nonisolated static let ktPerMS = 3600 / mPerNm
}
