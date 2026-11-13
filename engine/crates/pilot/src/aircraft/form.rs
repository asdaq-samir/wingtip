//! The "Your Airplane" form's fields as typed, checked before the round
//! trip to the gateway, each problem in the words shown under its field:
//! one copy for the web, the iPhone and Android (the rule
//! `aircraft_problems`). The limits are stated here alone: the gateway
//! keeps none and asks this rule before it saves an airplane (its
//! AircraftLimits, through the planner's POST /api/aircraft/problems), so
//! a value the form lets through the gateway takes. The database
//! columns' lengths are the gateway's V3 migration's.

use crate::json::{self, Value};

/// A tail number or type designator, at most this many characters: the
/// columns' own (the gateway's V3 migration).
pub const IDENT_MAX: usize = 16;
/// A cruise power a cruise table has, percent: the planner's performance
/// reader's (a design bound, no regulation).
pub const POWER_PCT: (f64, f64) = (40.0, 100.0);
/// FAA Form 7233-4's item 10a (equipment) and 10b (surveillance): letters
/// and figures, at most 40 and 20 (AIM Appendix 4, TBL 4-2 and 4-3, whose
/// codes include E1, J1 and B1).
pub const EQUIPMENT_MAX: usize = 40;
pub const SURVEILLANCE_MAX: usize = 20;
/// Item 19's colour and markings, plain words, at most the column's 40.
pub const COLOUR_MAX: usize = 40;

/// A field as typed, trimmed; "" where missing or null.
fn typed<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("").trim()
}

/// A typed number, where it reads as a finite one.
fn number(s: &str) -> Option<f64> {
    s.parse::<f64>().ok().filter(|n| n.is_finite())
}

/// Letters and figures only (ASCII), at most `max`.
fn codes(s: &str, max: usize) -> bool {
    s.chars().count() <= max && s.chars().all(|c| c.is_ascii_alphanumeric())
}

/// What is wrong, by field (the gateway's AircraftRequest names), in the
/// order the form shows them; none where it may be saved. Lengths are
/// counted in characters.
pub fn problems(v: &Value) -> Vec<(&'static str, String)> {
    let mut out: Vec<(&'static str, String)> = Vec::new();
    for (key, label) in [("tailNumber", "Tail number"), ("typeDesignator", "Type designator")] {
        let t = typed(v, key);
        if t.is_empty() {
            out.push((key, format!("{label} is required")));
        } else if t.chars().count() > IDENT_MAX {
            out.push((key, format!("At most {IDENT_MAX} characters")));
        }
    }
    // The cruise figures are needed; the climb's and the usable fuel may be
    // left blank (the planner then climbs at the type's book figures, and
    // the nav log makes no fuel check rather than a wrong one).
    let positive = [
        ("cruiseTasKt", "Cruise speed", true),
        ("fuelBurnGph", "Cruise fuel burn", true),
        ("climbTasKt", "Climb speed", false),
        ("climbFuelBurnGph", "Climb fuel burn", false),
        ("descentIasKt", "Descent speed", false),
        ("descentFuelBurnGph", "Descent fuel burn", false),
        ("usableFuelGal", "Usable fuel", false),
    ];
    for (key, label, required) in positive {
        let t = typed(v, key);
        if (t.is_empty() && required) || (!t.is_empty() && number(t).is_none_or(|n| n <= 0.0)) {
            out.push((key, format!("{label} must be a positive number")));
        }
    }
    let power = typed(v, "cruisePowerPct");
    if !power.is_empty() && number(power).is_none_or(|p| p < POWER_PCT.0 || p > POWER_PCT.1) {
        out.push(("cruisePowerPct", "Cruise power must be between 40 and 100%".to_owned()));
    }
    if !codes(typed(v, "equipment"), EQUIPMENT_MAX) {
        out.push(("equipment", "Letters and figures, as SDFGRY".to_owned()));
    }
    if !codes(typed(v, "surveillance"), SURVEILLANCE_MAX) {
        out.push(("surveillance", "Letters and figures, as B1".to_owned()));
    }
    if typed(v, "colour").chars().count() > COLOUR_MAX {
        out.push(("colour", format!("At most {COLOUR_MAX} characters")));
    }
    out
}

/// `aircraft_problems`: `{field: words}` from the form's fields as typed
/// (strings, the gateway's names), `{}` where it may be saved.
pub fn call(_name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::from("{");
    for (i, (key, words)) in problems(v).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, key);
        out.push(':');
        json::string(&mut out, words);
    }
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(text: &str) -> String {
        call("aircraft_problems", &json::parse(text).unwrap()).unwrap()
    }

    #[test]
    fn a_whole_form_has_no_problem() {
        assert_eq!(ask(r#"{"tailNumber":"N12345","typeDesignator":"C172","cruiseTasKt":"122","fuelBurnGph":"8.5"}"#), "{}");
    }

    #[test]
    fn each_field_says_what_is_wrong() {
        let all = ask(r#"{"tailNumber":" ","typeDesignator":"ABCDEFGHIJKLMNOPQ","cruiseTasKt":"0","fuelBurnGph":"x","climbTasKt":"-1",
            "cruisePowerPct":"101","equipment":"S/D","surveillance":"B1","colour":""}"#);
        assert!(all.contains(r#""tailNumber":"Tail number is required""#), "{all}");
        assert!(all.contains(r#""typeDesignator":"At most 16 characters""#), "{all}");
        assert!(all.contains(r#""cruiseTasKt":"Cruise speed must be a positive number""#), "{all}");
        assert!(all.contains(r#""fuelBurnGph":"Cruise fuel burn must be a positive number""#), "{all}");
        assert!(all.contains(r#""climbTasKt":"Climb speed must be a positive number""#), "{all}");
        assert!(all.contains(r#""cruisePowerPct":"Cruise power must be between 40 and 100%""#), "{all}");
        assert!(all.contains(r#""equipment":"Letters and figures, as SDFGRY""#), "{all}");
        assert!(!all.contains("surveillance") && !all.contains("climbFuelBurnGph"), "{all}");
        // 40 and 100 are inside; "inf" is no number.
        assert!(!ask(r#"{"cruisePowerPct":"40"}"#).contains("cruisePowerPct"));
        assert!(ask(r#"{"usableFuelGal":"inf"}"#).contains("usableFuelGal"));
    }
}
