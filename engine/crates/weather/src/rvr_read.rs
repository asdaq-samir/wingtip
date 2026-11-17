//! An RVR system's readings as its feed sends them (`rvr_readings`):
//! STDDS's APDS messages, which the planner's wingtip.rvr reads, give each
//! runway end's touchdown, midpoint and rollout visual range as two
//! figures in hundreds of feet ("35" is 3,500 ft), "00", "FF" or blanks
//! where a part reports none.
//!
//! AIM 7-1-13 (current, read 2026-11-17): readouts "are displayed in 200
//! foot increments to 3,000 feet and in 500 foot increments from 3,000
//! feet to a maximum value of 6,000 feet". A reading of the system's most
//! is "6,000 or more": the runway's visual range may be any greater, and
//! rvr.rs's `rvr_check` holds such a reading under no minimum its table
//! reaches. Which reading is compared with a minimum is rvr.rs's.

use crate::json::Value;
use crate::rvr::MOST_FT;

/// One reading in feet, None where the part reports none: two figures,
/// hundreds of feet, "00" none.
pub fn reading_ft(text: &str) -> Option<u32> {
    let text = text.trim();
    if text.len() != 2 || !text.bytes().all(|b| b.is_ascii_digit()) || text == "00" {
        return None;
    }
    text.parse::<u32>().ok().map(|n| n * 100)
}

/// Whether a reading is the system's most, 6,000 ft or more (AIM 7-1-13).
pub fn at_most(ft: Option<u32>) -> bool {
    ft.is_some_and(|f| f64::from(f) >= MOST_FT)
}

/// `rvr_readings`: `{"readings": ["35", "FF", null, ...]}` to
/// `{"readings": [{"ft", "more"}, ...]}`, in the order given.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let list = v.get("readings").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"readings\" is missing or not a list"))?;
    let mut out = String::from("{\"readings\":[");
    for (n, item) in list.iter().enumerate() {
        let text = match item {
            Value::Null => "",
            Value::String(s) => s.as_str(),
            _ => return Err(format!("{name}: \"readings\" holds a value that is not a string")),
        };
        let ft = reading_ft(text);
        if n > 0 {
            out.push(',');
        }
        out.push_str("{\"ft\":");
        match ft {
            Some(f) => out.push_str(&f.to_string()),
            None => out.push_str("null"),
        }
        out.push_str(if at_most(ft) { ",\"more\":true}" } else { ",\"more\":false}" });
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    #[test]
    fn a_reading_is_hundreds_of_feet_and_none_is_none() {
        assert_eq!(reading_ft("35"), Some(3500));
        assert_eq!(reading_ft(" 06 "), Some(600));
        for none in ["00", "FF", "", "  ", "5", "123", "-1"] {
            assert_eq!(reading_ft(none), None, "{none:?}");
        }
    }

    #[test]
    fn six_thousand_feet_is_the_systems_most() {
        // AIM 7-1-13: "to a maximum value of 6,000 feet".
        assert!(at_most(reading_ft("60")));
        assert!(!at_most(reading_ft("55")));
        assert!(!at_most(None));
    }

    #[test]
    fn the_call_answers_each_reading_in_order() {
        let v = json::parse(r#"{"readings":["35","60","FF",null]}"#).unwrap();
        assert_eq!(
            call("rvr_readings", &v).unwrap(),
            r#"{"readings":[{"ft":3500,"more":false},{"ft":6000,"more":true},{"ft":null,"more":false},{"ft":null,"more":false}]}"#
        );
        assert!(call("rvr_readings", &json::parse(r#"{"readings":[35]}"#).unwrap()).is_err());
    }
}
