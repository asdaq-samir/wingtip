//! Own ship's still-air glide (the web's lib/map/glide): the ring on the
//! map, the fields in reach on the Nearest card, and whether the airplane
//! is moving at flying speed at all.

use super::opt;
use crate::json::{self, Value};

// The figures themselves are procedures' (figures::glide), which the
// emergency's best fields glide by too; here by the names they had.
pub use crate::figures::glide::{nm_per_1000_ft, range_nm, reaches, underway, AIRBORNE_AGL_FT, ARRIVE_AGL_FT};

/// `glide_range`: nm or null, from `{"altitude_ft"?, "speed_kt"?,
/// "ground_ft"?, "glide_ratio"?}` -- the ratio the picked airplane's
/// profile gives, none with no airplane or none in its profile.
pub(super) fn range_rule(v: &Value) -> Result<String, String> {
    let n = "glide_range";
    let mut out = String::new();
    json::opt_number(
        &mut out,
        range_nm(opt(n, v, "altitude_ft")?, opt(n, v, "speed_kt")?, opt(n, v, "ground_ft")?, opt(n, v, "glide_ratio")?),
    );
    Ok(out)
}

/// `glide_reaches`: true or false, from `{"altitude_ft"?, "speed_kt"?,
/// "distance_nm", "elevation_ft"?, "glide_ratio"?}`.
pub(super) fn reaches_rule(v: &Value) -> Result<String, String> {
    let n = "glide_reaches";
    let distance = opt(n, v, "distance_nm")?.ok_or("glide_reaches: \"distance_nm\" is missing")?;
    let yes = reaches(opt(n, v, "altitude_ft")?, opt(n, v, "speed_kt")?, distance, opt(n, v, "elevation_ft")?, opt(n, v, "glide_ratio")?);
    Ok(if yes { "true" } else { "false" }.to_owned())
}

/// `underway`: true or false, from `{"speed_kt"?}`.
pub(super) fn underway_rule(v: &Value) -> Result<String, String> {
    Ok(if underway(opt("underway", v, "speed_kt")?) { "true" } else { "false" }.to_owned())
}
