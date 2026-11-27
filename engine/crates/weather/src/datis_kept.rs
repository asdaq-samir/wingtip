//! How long a live report the planner keeps is still the airport's, for
//! its live reports (wingtip.live_reports): a digital ATIS broadcast
//! (`datis_ends`, wingtip.datis, STDDS's TDES feed), a runway's RVR
//! (`rvr_ends`, wingtip.rvr, STDDS's APDS feed) and a traffic management
//! program or restriction (`flow_ends`, wingtip.flow, TFMS's flow
//! information).
//!
//! AIM 4-1-13 (current, read 2026-11-17): the "ATIS broadcast must be
//! updated upon the receipt of any official hourly and special weather. A
//! new recording will also be made when there is a change in other
//! pertinent data such as runway change, instrument approach in use,
//! etc." So a broadcast is made again at least each hour, and one heard
//! 75 minutes ago -- an hourly update missed, with a quarter hour for the
//! observation and its broadcast to come -- is no longer the airport's:
//! the next one should have been heard. A new letter writes over the last
//! before then, so the 75 minutes only bound one the feed stopped sending.
//! A briefing told no D-ATIS errs toward the pilot listening to the ATIS
//! on the radio.

use crate::json::{self, Value};

/// How long a broadcast is the airport's after it was heard, s: AIM
/// 4-1-13's hourly update, and a quarter hour for it to come (a design
/// bound erring toward the pilot listening on the radio).
pub const DATIS_KEPT_S: f64 = 75.0 * 60.0;

/// How long a runway's RVR reading is given after it was heard, s. AIM
/// 7-1-13: RVR is "updated approximately once every minute", so a reading
/// not followed by another in ten minutes is one the system or the feed
/// stopped sending, not the runway's visual range now. A design bound, no
/// rule, that errs toward saying no RVR: the pilot then takes the
/// visibility, as 14 CFR 91.175(h)(1) has it where RVR is not reported.
pub const RVR_KEPT_S: f64 = 600.0;

/// How long a ground stop, ground delay program or restriction the
/// Command Center gives no end for is kept, s. The ATCSCC's advisories
/// give each program's effective period (FAA JO 7210.3, chapter 17) and
/// a revision or a cancellation as it changes, so one with none is held
/// for six hours, a design bound, no rule: long enough for a program a
/// pilot plans round, after which a program still running will have been
/// advised again.
pub const FLOW_OPEN_ENDED_S: f64 = 6.0 * 3600.0;

/// `datis_ends`, `rvr_ends`: `{"heard"}` (UNIX seconds) to `{"ends"}`,
/// when the broadcast or the reading is no longer the airport's;
/// `flow_ends`: `{"heard", "ends"?}`, the program's own end where it gives
/// one, else FLOW_OPEN_ENDED_S after it was heard.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let heard = v.get("heard").and_then(Value::as_f64).filter(|f| f.is_finite());
    let heard = heard.ok_or_else(|| format!("{name}: \"heard\" is not a number"))?;
    let ends = match name {
        "rvr_ends" => heard + RVR_KEPT_S,
        "flow_ends" => match v.get("ends") {
            None | Some(Value::Null) => heard + FLOW_OPEN_ENDED_S,
            Some(e) => e.as_f64().filter(|f| f.is_finite()).ok_or_else(|| format!("{name}: \"ends\" is not a number"))?,
        },
        "datis_ends" => heard + DATIS_KEPT_S,
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    let mut out = String::from("{\"ends\":");
    json::number(&mut out, ends);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_broadcast_is_the_airports_for_an_hourly_update_and_a_quarter_hour() {
        // AIM 4-1-13: updated with each hourly weather, so 75 minutes.
        let v = json::parse(r#"{"heard":1000}"#).unwrap();
        assert_eq!(call("datis_ends", &v).unwrap(), r#"{"ends":5500.0}"#);
        assert!(call("datis_ends", &json::parse(r#"{"heard":null}"#).unwrap()).is_err());
        // A name it doesn't know is refused, never answered as the D-ATIS.
        assert!(call("datis_end", &v).is_err());
    }

    #[test]
    fn rvr_for_ten_minutes_and_a_program_to_its_end_or_six_hours() {
        let v = json::parse(r#"{"heard":1000}"#).unwrap();
        assert_eq!(call("rvr_ends", &v).unwrap(), r#"{"ends":1600.0}"#);
        assert_eq!(call("flow_ends", &v).unwrap(), r#"{"ends":22600.0}"#);
        let given = json::parse(r#"{"heard":1000,"ends":5000}"#).unwrap();
        assert_eq!(call("flow_ends", &given).unwrap(), r#"{"ends":5000.0}"#);
        assert!(call("flow_ends", &json::parse(r#"{"heard":1000,"ends":"soon"}"#).unwrap()).is_err());
    }
}
