//! How long a digital ATIS broadcast is still the airport's (`datis_ends`),
//! for the planner's live reports (wingtip.datis keeps each airport's last
//! one heard on STDDS's TDES feed until then).
//!
//! AIM 4-1-13 (current, read 2026-11-17): the "ATIS broadcast must be
//! updated upon the receipt of any official hourly and special weather. A
//! new recording will also be made when there is a change in other
//! pertinent data such as runway change, instrument approach in use,
//! etc." So a broadcast is made again at least each hour, and one heard
//! two hours ago -- an hourly update missed -- is no longer the airport's:
//! the next one should have been heard. A new letter writes over the last
//! before then, so the two hours only bound one the feed stopped sending.
//! A briefing told no D-ATIS errs toward the pilot listening to the ATIS
//! on the radio.

use crate::json::{self, Value};

/// How long a broadcast is the airport's after it was heard, s: two of
/// AIM 4-1-13's hourly updates.
pub const DATIS_KEPT_S: f64 = 2.0 * 3600.0;

/// `datis_ends`: `{"heard"}` (UNIX seconds) to `{"ends"}`, when the
/// broadcast is no longer the airport's.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let heard = v.get("heard").and_then(Value::as_f64).filter(|f| f.is_finite());
    let heard = heard.ok_or_else(|| format!("{name}: \"heard\" is not a number"))?;
    let mut out = String::from("{\"ends\":");
    json::number(&mut out, heard + DATIS_KEPT_S);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_broadcast_is_the_airports_for_two_hourly_updates() {
        // AIM 4-1-13: updated with each hourly weather, so two hours.
        let v = json::parse(r#"{"heard":1000}"#).unwrap();
        assert_eq!(call("datis_ends", &v).unwrap(), r#"{"ends":8200.0}"#);
        assert!(call("datis_ends", &json::parse(r#"{"heard":null}"#).unwrap()).is_err());
    }
}
