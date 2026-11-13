//! The exact conversions the crates share, one copy each and nowhere else
//! (scripts/ci/simplicity_ratchet.py counts a unit literal outside this
//! file). Each is a definition, not an aviation rule: the international
//! foot, pound, inch and nautical mile (the international yard and pound
//! agreement of 1959; NIST SP 811 B.8 and B.9), the statute mile of 5,280
//! of those feet, the US gallon of 231 cubic inches (NIST Handbook 44,
//! Appendix C), the conventional inch of mercury (NIST SP 811 B.8) and the
//! kelvin's offset from the Celsius scale (NIST SP 811 4.2.1.1). A factor
//! made of others is worked out here from them, never typed rounded
//! (6,076.12 ft a nautical mile was 0.005 ft long). The planner's own copy
//! is wingtip.units.

/// Metres in a foot, the international foot (NIST SP 811 B.9).
pub const M_PER_FT: f64 = 0.3048;
/// Feet in a metre: 3.280839895..., not the rounded 3.28084.
pub const FT_PER_M: f64 = 1.0 / M_PER_FT;
/// Metres in a nautical mile, the international nautical mile (NIST SP
/// 811 B.9).
pub const M_PER_NM: f64 = 1852.0;
/// Feet in a nautical mile: 1,852 m over 0.3048 m, 6,076.115485....
pub const FT_PER_NM: f64 = M_PER_NM / M_PER_FT;
/// Feet in a statute mile (NIST SP 811 B.9).
pub const FT_PER_SM: f64 = 5280.0;
/// Metres in a statute mile: 5,280 ft of 0.3048 m, 1,609.344 m exactly.
pub const M_PER_SM: f64 = FT_PER_SM * M_PER_FT;
/// Nautical miles in a statute mile (so also knots in a mile an hour).
pub const NM_PER_SM: f64 = M_PER_SM / M_PER_NM;
/// Knots in a metre a second: 3,600 s an hour over 1,852 m a mile.
pub const KT_PER_M_S: f64 = 3600.0 / M_PER_NM;
/// Metres a second in a knot.
pub const M_S_PER_KT: f64 = M_PER_NM / 3600.0;
/// Kilograms in a pound, the international avoirdupois pound (NIST SP 811
/// B.9).
pub const KG_PER_LB: f64 = 0.453_592_37;
/// Millimetres in an inch, the international inch (NIST SP 811 B.9).
pub const MM_PER_IN: f64 = 25.4;
/// Litres in a US gallon, 231 cubic inches (NIST Handbook 44, Appendix C).
pub const L_PER_GAL: f64 = 3.785_411_784;
/// Hectopascals in an inch of mercury, the conventional inch (NIST SP 811
/// B.8: 3,386.389 Pa), as altimeter settings are given in.
pub const HPA_PER_INHG: f64 = 33.863_89;
/// Kelvin at 0 degrees Celsius (NIST SP 811 4.2.1.1).
pub const KELVIN_AT_0_C: f64 = 273.15;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_derived_factors_are_the_definitions_worked_out() {
        // 1,852 / 0.3048 = 6,076.115 485 56... ft (NIST SP 811 B.9).
        assert!((FT_PER_NM - 6_076.115_485_564_304).abs() < 1e-9);
        assert!((FT_PER_M - 3.280_839_895_013_123).abs() < 1e-12);
        assert_eq!(M_PER_SM, 1609.344);
        assert!((NM_PER_SM - 0.868_976_241_900_648).abs() < 1e-12);
    }
}
