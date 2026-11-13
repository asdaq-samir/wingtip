//! The SI's exact conversions the crates share, one copy each: the
//! international foot and nautical mile (NIST SP 811 B.9) and the kelvin's
//! offset from the Celsius scale (NIST SP 811 4.2.1.1). Definitions, not
//! aviation rules; the planner's own copy is wingtip.units.

/// Metres in a foot, the international foot (NIST SP 811 B.9).
pub const M_PER_FT: f64 = 0.3048;
/// Knots in a metre a second, by the international nautical mile (1,852
/// m, NIST SP 811 B.9): 3,600 s an hour over 1,852 m a mile.
pub const KT_PER_M_S: f64 = 3600.0 / 1852.0;
/// Kelvin at 0 degrees Celsius (NIST SP 811 4.2.1.1).
pub const KELVIN_AT_0_C: f64 = 273.15;
