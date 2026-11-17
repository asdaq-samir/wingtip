//! Whether a station's report is near enough to a field to say the field's
//! weather by it, approximately (`report_near`): the airport card's "≈"
//! chip on a field with no METAR of its own, from the nearest station's
//! (the planner's wingtip.weather.nearest_report).
//!
//! A design choice, not a rule: no FAA source says a station's flight
//! category holds at another field. FAA-H-8083-28B (Aviation Weather
//! Handbook, 2022) 24.4.3.8.2, "Proximity Qualifier": "Weather phenomena
//! occurring beyond the point of observation (between 5–10 SM) are coded
//! as in the vicinity (VC)" -- the farthest a METAR speaks of. The chip
//! stops at the top of that range, 10 statute miles; farther, the card
//! gives the report and how far it is, and says nothing of the field's
//! weather by it. Statute miles, as a METAR's distances are; the planner
//! measures in nautical miles, so the distance is asked in those.

use crate::json::{self, Value};
use wingtip_core::units::NM_PER_SM;

/// The farthest a report is said of a field, statute miles: the top of
/// a METAR's vicinity (FAA-H-8083-28B 24.4.3.8.2).
pub const NEAR_REPORT_SM: f64 = 10.0;

/// Whether a station `distance_nm` from a field is near enough.
pub fn near(distance_nm: f64) -> bool {
    distance_nm <= NEAR_REPORT_SM * NM_PER_SM
}

/// `report_near`: `{"distance_nm"}` to `{"near", "within_sm"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let nm = v.get("distance_nm").and_then(Value::as_f64).filter(|f| f.is_finite());
    let nm = nm.ok_or_else(|| format!("{name}: \"distance_nm\" is not a number"))?;
    let mut out = format!("{{\"near\":{},\"within_sm\":", near(nm));
    json::number(&mut out, NEAR_REPORT_SM);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_statute_miles_is_near_and_past_it_is_not() {
        // 10 SM is 8.69 nm: just inside and just past it.
        assert!(near(8.68));
        assert!(near(10.0 * NM_PER_SM));
        assert!(!near(8.70));
        let v = json::parse(r#"{"distance_nm":5}"#).unwrap();
        assert_eq!(call("report_near", &v).unwrap(), r#"{"near":true,"within_sm":10.0}"#);
        assert!(call("report_near", &json::parse("{}").unwrap()).is_err());
    }
}
