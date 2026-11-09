//! The pilot's-eye view's colours for the ground (the web's
//! lib/map/gl/terrain): from the airplane's altitude, where the ground
//! turns amber and where red, as the cockpit's terrain pages colour it.
//!
//! The bands are the owner's (2026-11-09): amber for the ground within
//! 1,000 ft below the airplane, red for the ground at or above it. Garmin's
//! G1000 terrain page draws yellow from 1,000 ft below too; its red starts
//! 100 ft below, where this view's starts at the airplane's own altitude.
//! It is a picture of the plan over the ground, not terrain clearance: no
//! TAWS (TSO-C151), and nothing of 14 CFR 91.119 or 91.177's minimums,
//! which the plan's own altitudes answer (crate altitude's floors).

use super::num;
use crate::json::{self, Value};

/// How far under the airplane the ground is drawn amber, ft.
pub const CAUTION_BAND_FT: f64 = 1000.0;

/// The ground's bands under an airplane at `altitude_ft` MSL: amber from
/// `caution_from_ft`, red from `warning_from_ft`, both feet MSL.
pub fn bands(altitude_ft: f64) -> (f64, f64) {
    (altitude_ft - CAUTION_BAND_FT, altitude_ft)
}

/// `terrain_view_bands`: `{"caution_from_ft", "warning_from_ft"}` from
/// `{"altitude_ft"}`.
pub(super) fn bands_rule(v: &Value) -> Result<String, String> {
    let (caution, warning) = bands(num("terrain_view_bands", v, "altitude_ft")?);
    let mut out = String::from("{\"caution_from_ft\":");
    json::number(&mut out, caution);
    out.push_str(",\"warning_from_ft\":");
    json::number(&mut out, warning);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amber_within_a_thousand_feet_below_and_red_from_the_airplanes_own_altitude() {
        assert_eq!(bands(5500.0), (4500.0, 5500.0));
        assert_eq!(bands(800.0), (-200.0, 800.0));
    }
}
