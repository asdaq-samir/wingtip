//! The time a G-AIRMET snapshot stands for, for the briefing's "when the
//! flight meets each hazard" (the planner's app.exposure): from three
//! hours before its valid time to three hours after.
//!
//! AIM 7-1-6 (current, read 2026-11-12): G-AIRMETs "are valid at discrete
//! times no more than 3 hours apart for a period of up to 12 hours into
//! the future", and between two of them "the user should assume the
//! hazardous weather condition is occurring between the snap shots unless
//! informed otherwise. For example, if a 00-hour forecast shows no hazard,
//! a 03-hour forecast shows the presence of hazardous weather, and a
//! 06-hour forecast shows no hazard, the user should assume the hazard
//! exists from the 0001 hour to the 0559 hour time period." So a snapshot
//! stands for up to the whole gap either side of it, three hours, never
//! less: an hour and a half told an airplane there at 0020Z or 0540Z the
//! hazard was before or after it (the aviation check, 2026-10-27). The
//! window errs long, toward telling of the hazard.
//!
//! Which snapshot is told for a hazard (the one nearest when the flight
//! is in it) stays with the host; this is the window it is held to.

use crate::json::{self, Value};

/// How long either side of its valid time a G-AIRMET snapshot stands for,
/// seconds: the most there is between two (AIM 7-1-6, "no more than 3
/// hours apart").
pub const GAIRMET_STANDS_FOR_S: f64 = 3.0 * 3600.0;

/// The window a snapshot valid at `valid_s` (UNIX seconds) stands for.
pub fn window(valid_s: f64) -> (f64, f64) {
    (valid_s - GAIRMET_STANDS_FOR_S, valid_s + GAIRMET_STANDS_FOR_S)
}

/// `gairmet_window`: `{"valid"}` (UNIX seconds) to `{"valid_from",
/// "valid_to"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let valid = v.get("valid").and_then(Value::as_f64).filter(|f| f.is_finite());
    let (from, to) = window(valid.ok_or_else(|| format!("{name}: \"valid\" is not a number"))?);
    let mut out = String::from("{\"valid_from\":");
    json::number(&mut out, from);
    out.push_str(",\"valid_to\":");
    json::number(&mut out, to);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_snapshot_stands_for_three_hours_either_side() {
        // AIM 7-1-6's example: a hazard at 03 and none at 00 or 06 exists
        // from 0001 to 0559, so the 03 snapshot (10,800 s) is held to an
        // airplane there at 0020 and 0540, and so to 00 and 06.
        let (from, to) = window(10_800.0);
        assert_eq!((from, to), (0.0, 21_600.0));
        assert!(from <= 20.0 * 60.0 && to >= 5.0 * 3600.0 + 40.0 * 60.0);
        let v = json::parse(r#"{"valid":10800}"#).unwrap();
        assert_eq!(call("gairmet_window", &v).unwrap(), r#"{"valid_from":0.0,"valid_to":21600.0}"#);
        assert!(call("gairmet_window", &json::parse(r#"{"valid":null}"#).unwrap()).is_err());
    }
}
