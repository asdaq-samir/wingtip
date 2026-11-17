//! Whether a recorded ADS-B track starts at its takeoff from a field
//! (`track_left_from`): the traffic card's "left from" (the planner's
//! wingtip.traffic.flights). A track recorded from when a card was opened
//! mostly starts in the air on the way somewhere -- N3429J's, opened over
//! Burlington at 2,000 ft, was said to have left KBUU where it had left
//! C81 -- so only one whose first point is close to the nearest field and
//! low over it is taken as that field's departure.
//!
//! AC 90-66C (current, read 2026-11-17): 11.7, "Airplanes remaining in the
//! traffic pattern should not commence a turn to the crosswind leg until
//! beyond the departure end of the runway and within 300 feet below
//! traffic pattern altitude"; Appendix A, the pattern altitude "is usually,
//! unless otherwise established ..., 1,000 feet above the elevation of the
//! airport surface", and its Departure "continues until reaching a point
//! at least 1/2 mile beyond the departure end of the runway and within 300
//! feet of the traffic pattern altitude". So an airplane 500 ft over the field is
//! still on its takeoff climb, under the 700 ft where it may first turn,
//! and 2 nm reaches past the departure leg of a field's longest runways.
//! Both are this check's judgment from those figures, not a rule: a
//! track first seen higher or farther says nothing of where it left.

use crate::json::Value;
use wingtip_core::ask::Ask;

/// How near the nearest field a track's first point must be, nm.
pub const LEFT_NEAR_NM: f64 = 2.0;
/// How far over the field's elevation it may be, ft: under AC 90-66C's
/// crosswind turn, 300 ft below a 1,000 ft AGL pattern.
pub const LEFT_ABOVE_FT: f64 = 500.0;

/// Whether a first point `distance_nm` from the nearest field and
/// `above_ft` over its elevation is its takeoff from it.
pub fn left_from(distance_nm: f64, above_ft: f64) -> bool {
    distance_nm <= LEFT_NEAR_NM && above_ft <= LEFT_ABOVE_FT
}

/// `track_left_from`: `{"distance_nm", "above_ft"}` to `{"left"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let (nm, ft) = (ask.num("distance_nm")?, ask.num("above_ft")?);
    Ok(format!("{{\"left\":{}}}", nm.is_finite() && ft.is_finite() && left_from(nm, ft)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    #[test]
    fn close_and_low_is_a_takeoff_and_either_past_is_not() {
        assert!(left_from(2.0, 500.0));
        assert!(left_from(0.3, -20.0));
        assert!(!left_from(2.01, 100.0));
        assert!(!left_from(1.0, 501.0));
        // A track first seen at pattern altitude, 1,000 ft up, is not a takeoff.
        assert!(!left_from(1.2, 1000.0));
        let v = json::parse(r#"{"distance_nm":1.0,"above_ft":300}"#).unwrap();
        assert_eq!(call("track_left_from", &v).unwrap(), r#"{"left":true}"#);
        assert!(call("track_left_from", &json::parse(r#"{"distance_nm":1}"#).unwrap()).is_err());
    }
}
