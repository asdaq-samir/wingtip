//! The "Your Airplane" form's fields as typed, checked before the round
//! trip to the gateway, each problem in the words shown under its field:
//! one copy for the web, the iPhone and Android (the rule
//! `aircraft_problems`). The limits are stated here alone: the gateway
//! keeps none and asks this rule before it saves an airplane (its
//! AircraftLimits, through the planner's POST /api/aircraft/problems), and
//! the planner's queries take each figure's range from
//! `airplane_figure_ranges` (app.plan_query), so a value the form lets
//! through the gateway takes and every later plan takes too. The
//! database columns' lengths are the gateway's V3 migration's.

use crate::json::{self, Value};

/// A tail number or type designator, at most this many characters: the
/// columns' own (the gateway's V3 migration).
pub const IDENT_MAX: usize = 16;
/// FAA Form 7233-4's item 10a (equipment) and 10b (surveillance): letters
/// and figures, at most 40 and 20 (AIM Appendix 4, TBL 4-2 and 4-3, whose
/// codes include E1, J1 and B1).
pub const EQUIPMENT_MAX: usize = 40;
pub const SURVEILLANCE_MAX: usize = 20;
/// Item 19's colour and markings, plain words, at most the column's 40.
pub const COLOUR_MAX: usize = 40;

/// The range one of an airplane's own figures may take: above `min` (or
/// at it, where `min_inclusive`) and at most `max`.
pub struct Range {
    /// The form's and the gateway's name (AircraftRequest, OwnFigures).
    pub field: &'static str,
    /// The planner's query parameter (app.plan_query).
    pub query: &'static str,
    pub label: &'static str,
    pub unit: &'static str,
    pub min: f64,
    pub min_inclusive: bool,
    pub max: f64,
    /// The form needs it: the cruise figures every leg is worked from.
    pub required: bool,
}

/// A figure above zero and at most `max`.
const fn range(field: &'static str, query: &'static str, label: &'static str, unit: &'static str, max: f64) -> Range {
    Range { field, query, label, unit, min: 0.0, min_inclusive: false, max, required: false }
}

/// Every figure's range, in the order the form shows them. None of these
/// is a regulation or a handbook's figure: each is a sanity bound that
/// keeps a typo out of the plan (a pilot's own handbook figure is always
/// inside it), wide enough for any light piston airplane, twin or single
/// turboprop the planner plans, and stated here alone.
/// - The speeds and burns are above zero: every leg's time divides by the
///   speed (zero was a ZeroDivisionError in the planner), and a burn of
///   zero would plan a leg on no fuel. 1,000 kt is past any airplane's
///   cruise or climb the planner plans, 150 gal/h past a twin's or a
///   single turboprop's burn, 2,000 gal past its tanks.
/// - The descent is flown at an indicated speed (the engine turns it to
///   true at the altitudes it passes through): 30 to 300 kt and 1 to
///   150 gal/h cover a light piston airplane's, a twin's or a single
///   turboprop's.
/// - The cruise power a cruise table has: from about 40 %, the lowest a
///   handbook's cruise table goes, to full power (a design bound).
/// - A service ceiling from a powered glider's to past a piston single's
///   highest; a sea-level climb rate under any piston airplane's; a start,
///   taxi and takeoff allowance of a few gallons; a still-air glide ratio
///   from a light airplane's (about 7 to 12 to 1) to a glider's (past 40).
pub const RANGES: [Range; 12] = [
    Range { required: true, ..range("cruiseTasKt", "cruise_tas_kt", "Cruise speed", "kt", 1000.0) },
    Range { required: true, ..range("fuelBurnGph", "fuel_burn_gph", "Cruise fuel burn", "gal/h", 150.0) },
    range("climbTasKt", "climb_tas_kt", "Climb speed", "kt", 1000.0),
    range("climbFuelBurnGph", "climb_fuel_burn_gph", "Climb fuel burn", "gal/h", 150.0),
    Range { min: 30.0, min_inclusive: true, ..range("descentIasKt", "descent_ias_kt", "Descent speed", "kt", 300.0) },
    Range { min: 1.0, min_inclusive: true, ..range("descentFuelBurnGph", "descent_fuel_burn_gph", "Descent fuel burn", "gal/h", 150.0) },
    range("usableFuelGal", "usable_fuel_gal", "Usable fuel", "gal", 2000.0),
    Range { min: 40.0, min_inclusive: true, ..range("cruisePowerPct", "cruise_power_pct", "Cruise power", "%", 100.0) },
    Range { min: 1000.0, min_inclusive: true, ..range("serviceCeilingFt", "service_ceiling_ft", "Service ceiling", "ft", 30000.0) },
    range("climbRateFpm", "climb_rate_fpm", "Climb rate", "fpm", 5000.0),
    Range { min_inclusive: true, ..range("taxiFuelGal", "taxi_fuel_gal", "Start and taxi fuel", "gal", 50.0) },
    Range { min: 1.0, ..range("glideRatio", "glide_ratio", "Glide ratio", "", 80.0) },
];

impl Range {
    /// Whether `n` is inside.
    pub fn holds(&self, n: f64) -> bool {
        (if self.min_inclusive { n >= self.min } else { n > self.min }) && n <= self.max
    }

    /// The words under the field for a value outside, or no number.
    fn words(&self, n: Option<f64>) -> String {
        let (label, min) = (self.label, figure(self.min));
        let max = match self.unit {
            "" => figure(self.max),
            "%" => format!("{}%", figure(self.max)),
            u => format!("{} {u}", figure(self.max)),
        };
        if self.min_inclusive {
            format!("{label} must be between {min} and {max}")
        } else if self.min != 0.0 {
            format!("{label} must be more than {min} and at most {max}")
        } else if n.is_some_and(|n| n > self.max) {
            format!("{label} must be at most {max}")
        } else {
            format!("{label} must be a positive number")
        }
    }
}

/// A whole figure with its thousands marked, as the form writes it: "1,000".
fn figure(v: f64) -> String {
    let digits = format!("{}", v.round() as i64);
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

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
    // The cruise figures are needed; the climb's, the descent's and the
    // usable fuel may be left blank (the planner then climbs at the type's
    // book figures, and the nav log makes no fuel check rather than a
    // wrong one), as may the airplane's own figures (the app asks for one
    // where it is needed).
    for r in &RANGES {
        let t = typed(v, r.field);
        if t.is_empty() {
            if r.required {
                out.push((r.field, r.words(None)));
            }
            continue;
        }
        let n = number(t);
        if !n.is_some_and(|n| r.holds(n)) {
            out.push((r.field, r.words(n)));
        }
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

/// `airplane_figure_ranges`: every figure's range, for the planner's
/// query parameters (and any app that bounds a field as it is typed).
fn ranges() -> String {
    let mut out = String::from("{\"ranges\":[");
    for (i, r) in RANGES.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"field\":");
        json::string(&mut out, r.field);
        out.push_str(",\"query\":");
        json::string(&mut out, r.query);
        out.push_str(",\"label\":");
        json::string(&mut out, r.label);
        out.push_str(",\"unit\":");
        json::string(&mut out, r.unit);
        out.push_str(",\"min\":");
        json::number(&mut out, r.min);
        out.push_str(if r.min_inclusive { ",\"min_inclusive\":true" } else { ",\"min_inclusive\":false" });
        out.push_str(",\"max\":");
        json::number(&mut out, r.max);
        out.push_str(if r.required { ",\"required\":true}" } else { ",\"required\":false}" });
    }
    out.push_str("]}");
    out
}

/// `aircraft_problems`: `{field: words}` from the form's fields as typed
/// (strings, the gateway's names), `{}` where it may be saved; and
/// `airplane_figure_ranges`, the ranges it checks the figures against.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name == "airplane_figure_ranges" {
        return Ok(ranges());
    }
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

    #[test]
    fn each_range_holds_both_its_ends() {
        // A descent IAS of 25 kt and a cruise TAS of 1,200 kt passed the
        // form and the gateway, then every plan was refused (CODE-10).
        let wrong =
            ask(r#"{"descentIasKt":"25","cruiseTasKt":"1200","descentFuelBurnGph":"151","glideRatio":"1","serviceCeilingFt":"30001"}"#);
        assert!(wrong.contains(r#""descentIasKt":"Descent speed must be between 30 and 300 kt""#), "{wrong}");
        assert!(wrong.contains(r#""cruiseTasKt":"Cruise speed must be at most 1,000 kt""#), "{wrong}");
        assert!(wrong.contains(r#""descentFuelBurnGph":"Descent fuel burn must be between 1 and 150 gal/h""#), "{wrong}");
        assert!(wrong.contains(r#""glideRatio":"Glide ratio must be more than 1 and at most 80""#), "{wrong}");
        assert!(wrong.contains(r#""serviceCeilingFt":"Service ceiling must be between 1,000 and 30,000 ft""#), "{wrong}");
        let ends = ask(
            r#"{"tailNumber":"N1","typeDesignator":"C172","cruiseTasKt":"1000","fuelBurnGph":"0.1","descentIasKt":"30","descentFuelBurnGph":"150",
            "glideRatio":"80","serviceCeilingFt":"1000","taxiFuelGal":"0","climbRateFpm":"5000"}"#,
        );
        assert_eq!(ends, "{}");
    }

    #[test]
    fn the_ranges_are_the_ones_the_form_checks() {
        let answer = json::parse(&call("airplane_figure_ranges", &json::parse("{}").unwrap()).unwrap()).unwrap();
        let ranges = answer.get("ranges").and_then(Value::as_array).unwrap();
        assert_eq!(ranges.len(), RANGES.len());
        let power = ranges.iter().find(|r| r.get("query").and_then(Value::as_str) == Some("cruise_power_pct")).unwrap();
        assert_eq!(power.get("min").and_then(Value::as_f64), Some(40.0));
        assert_eq!(power.get("max").and_then(Value::as_f64), Some(100.0));
        assert_eq!(figure(30000.0), "30,000");
    }
}
