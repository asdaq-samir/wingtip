//! What a pilot's and an airplane's records say, for the gateway, which
//! keeps them and asked its own Java before (#482 phase 1): how long a
//! student's endorsement is good for (AC 61-65K's 90-day ones), the day
//! their solo endorsement runs out (14 CFR 61.87(n), (p)), what their
//! record answers of 61.93(d) for a solo cross-country, and when the
//! airplane's inspections fall due in calendar months (91.409(a),
//! 91.207(d), 91.411(a), 91.413(a)). The gateway asks them through the
//! planner (POST /api/pilot/endorsements, /api/aircraft/inspections).
//!
//! Days are "YYYY-MM-DD" on the pilot's own calendar, as currency.rs reads
//! them.

use super::currency::{day, end_of_month_after, iso_of_days};
use crate::json::{self, Value};
use crate::time::days_from_civil;

/// The endorsements that run out, by code, with the days each is good
/// for and the rule that says so: a solo endorsement "within the 90 days
/// preceding the date of the flight" (61.87(n)), renewed each further 90
/// days (61.87(p)), the night solo's (61.87(o)), and Class B's, "dated
/// within the 90-day period preceding the date of the flight" (61.95(a)(2),
/// (b)(2)). AC 61-65K's samples A.5-A.7, A.12, A.13. Every other
/// endorsement in the AC does not run out.
pub const RUNS_OUT: [(&str, i64, &str); 5] = [
    ("solo-first", 90, "61.87(n)"),
    ("solo-90", 90, "61.87(p)"),
    ("solo-night", 90, "61.87(o)"),
    ("class-b", 90, "61.95(a)"),
    ("class-b-airport", 90, "61.95(b)"),
];

/// The codes of a solo endorsement, first or further (61.87(n), (p)).
const SOLO: [&str; 2] = ["solo-first", "solo-90"];
/// The solo cross-country endorsement for the make and model (61.93(c)(1)
/// and (2), AC 61-65K A.9).
const SOLO_XC: &str = "solo-xc-training";

/// The days an endorsement of `code` is good for, None where it does not
/// run out.
pub fn good_for_days(code: &str) -> Option<i64> {
    RUNS_OUT.iter().find(|r| r.0 == code).map(|r| r.1)
}

/// One endorsement the student holds: its code, the day it was given
/// (as a day count), and the make and model it names where it says.
pub struct Held {
    pub code: String,
    pub on: i64,
    pub make_model: Option<String>,
}

fn days(name: &str, iso: &str) -> Result<i64, String> {
    let (y, m, d) = day(name, iso)?;
    Ok(days_from_civil(y, m, d))
}

/// The latest held of any of `codes`.
fn latest<'a>(held: &'a [Held], codes: &[&str]) -> Option<&'a Held> {
    held.iter().filter(|h| codes.contains(&h.code.as_str())).max_by_key(|h| h.on)
}

/// The last day the student may fly solo on their latest solo
/// endorsement, 90 days on (61.87(n), (p)); None with none.
pub fn solo_until(held: &[Held]) -> Option<i64> {
    latest(held, &SOLO).map(|h| h.on + good_for_days("solo-90").unwrap_or(90))
}

/// "5 Oct 2026", as the review sheet says a day.
pub(crate) fn said(day: i64) -> String {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let (y, m, d) = crate::time::civil_from_days(day);
    format!("{d} {} {y}", MONTHS[(m - 1) as usize])
}

fn given(h: &Held) -> String {
    let mm = h.make_model.as_deref().filter(|m| !m.trim().is_empty()).map(|m| format!(" for a {m}")).unwrap_or_default();
    format!("Given {}{mm}", said(h.on))
}

/// What the student's record answers of 14 CFR 61.93(d) for a solo
/// cross-country on `flight_on`: (4) a solo cross-country endorsement,
/// 61.93(c)(1) and (2), and (5) a solo endorsement current on the day,
/// 61.87(n) and (p) -- "within the 90 days preceding the date of the
/// flight". The rest of (d) -- the planning correct, the weather flyable
/// under VFR, the student proficient -- is the instructor's own to
/// determine. Each (rule, label, met, detail).
pub fn solo_xc_checks(flight_on: i64, held: &[Held]) -> Vec<(&'static str, &'static str, bool, String)> {
    let xc = latest(held, &[SOLO_XC]);
    let solo = latest(held, &SOLO);
    let current = solo.is_some_and(|h| h.on <= flight_on && h.on + 90 >= flight_on);
    vec![
        (
            "61.93(d)(4)",
            "A solo cross-country endorsement for the make and model",
            xc.is_some(),
            xc.map_or_else(|| "None on record".to_owned(), given),
        ),
        (
            "61.93(d)(5)",
            "A solo endorsement current on the day of the flight",
            current,
            solo.map_or_else(
                || "None on record".to_owned(),
                |h| {
                    format!(
                        "{}{}",
                        given(h),
                        if current { String::new() } else { format!(", not within the 90 days before {}", said(flight_on)) }
                    )
                },
            ),
        ),
    ]
}

/// The airplane's inspections and checks, each with the calendar months it
/// is good for: the annual (14 CFR 91.409(a)) and the ELT's (91.207(d)), 12;
/// the static system and altimeter (91.411(a)) and the transponder
/// (91.413(a)), 24. Something done "within the preceding N calendar
/// months" is good to the last day of the Nth month after the one it was
/// done in -- an annual on 5 October 2025 is good through 31 October 2026.
pub const INSPECTIONS: [(&str, i64); 4] = [("annual", 12), ("elt", 12), ("static_check", 24), ("transponder_check", 24)];

pub(crate) fn held_of(name: &str, v: &Value) -> Result<Vec<Held>, String> {
    let list = match v.get("held") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(l) => l.as_array().ok_or_else(|| format!("{name}: \"held\" is not a list"))?,
    };
    list.iter()
        .map(|h| {
            let code = h.get("code").and_then(Value::as_str).ok_or_else(|| format!("{name}: an endorsement has no \"code\""))?;
            let on = h.get("on").and_then(Value::as_str).ok_or_else(|| format!("{name}: an endorsement has no \"on\""))?;
            Ok(Held {
                code: code.to_owned(),
                on: days(name, on)?,
                make_model: h.get("make_model").and_then(Value::as_str).map(str::to_owned),
            })
        })
        .collect()
}

fn opt_day(out: &mut String, d: Option<i64>) {
    match d {
        Some(d) => json::string(out, &iso_of_days(d)),
        None => out.push_str("null"),
    }
}

/// The 100-hour inspection is due 100 hours of time in service after the
/// last (14 CFR 91.409(b)).
pub const HUNDRED_HOUR_H: f64 = 100.0;

/// A VOR check for IFR is good if done "within the preceding 30 days"
/// (14 CFR 91.171(a)(2)).
pub const VOR_CHECK_DAYS: i64 = 30;

/// The largest bearing error 91.171 allows for a kind of VOR check: a test
/// signal (VOT or a repair station's) or a surface checkpoint, 4 degrees
/// ((b)(1), (b)(2)); an airborne checkpoint or a radial along an airway, 6
/// ((b)(3), (b)(4)); one system against the other, 4 ((c)). The kinds by
/// the gateway's VorCheck names.
pub fn vor_limit_deg(kind: &str) -> Option<f64> {
    match kind {
        "VOT" | "REPAIR_STATION" | "GROUND" | "DUAL" => Some(4.0),
        "AIRBORNE" | "RADIAL" => Some(6.0),
        _ => None,
    }
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        // `{"held": [{"code", "on", "make_model"?}], "flight_on"?}`:
        // `{"until": [day|null] (each held's last good day, in order),
        // "solo_until", "checks": [{"rule", "label", "met", "detail"}]}`,
        // the checks for a solo cross-country on `flight_on`, [] without.
        "endorsement_records" => {
            let held = held_of(name, v)?;
            let mut out = String::from("{\"until\":[");
            for (i, h) in held.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                opt_day(&mut out, good_for_days(&h.code).map(|d| h.on + d));
            }
            out.push_str("],\"solo_until\":");
            opt_day(&mut out, solo_until(&held));
            out.push_str(",\"checks\":[");
            if let Some(flight_on) = v.get("flight_on").and_then(Value::as_str) {
                for (i, (rule, label, met, detail)) in solo_xc_checks(days(name, flight_on)?, &held).iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str("{\"rule\":");
                    json::string(&mut out, rule);
                    out.push_str(",\"label\":");
                    json::string(&mut out, label);
                    out.push_str(",\"met\":");
                    out.push_str(if *met { "true" } else { "false" });
                    out.push_str(",\"detail\":");
                    json::string(&mut out, detail);
                    out.push('}');
                }
            }
            out.push_str("]}");
            Ok(out)
        }
        // `{"annual_on"?, "elt_on"?, "static_check_on"?,
        // "transponder_check_on"?, "hundred_hour_at_hours"?, "vor_check"?:
        // {"on", "kind", "error_deg"}}`: each one's last good day,
        // `{"annual_until", "elt_until", "static_check_until",
        // "transponder_check_until", "hundred_hour_due_at_hours",
        // "vor_check": {"limit_deg", "within", "until"}}`, null where it was
        // not given.
        "inspections_due" => {
            let mut out = String::from("{\"hundred_hour_due_at_hours\":");
            json::opt_number(&mut out, v.get("hundred_hour_at_hours").and_then(Value::as_f64).map(|h| h + HUNDRED_HOUR_H));
            out.push_str(",\"vor_check\":");
            match v.get("vor_check") {
                None | Some(Value::Null) => out.push_str("null"),
                Some(c) => {
                    let kind = c.get("kind").and_then(Value::as_str).unwrap_or("");
                    let limit = vor_limit_deg(kind).ok_or_else(|| {
                        format!("{name}: a VOR check's \"kind\" is VOT, REPAIR_STATION, GROUND, AIRBORNE, RADIAL or DUAL, not {kind:?}")
                    })?;
                    let error = c
                        .get("error_deg")
                        .and_then(Value::as_f64)
                        .ok_or_else(|| format!("{name}: a VOR check's \"error_deg\" is not a number"))?;
                    let on = c.get("on").and_then(Value::as_str).ok_or_else(|| format!("{name}: a VOR check has no \"on\""))?;
                    out.push_str("{\"limit_deg\":");
                    json::number(&mut out, limit);
                    out.push_str(",\"within\":");
                    out.push_str(if error.abs() <= limit { "true" } else { "false" });
                    out.push_str(",\"until\":");
                    json::string(&mut out, &iso_of_days(days(name, on)? + VOR_CHECK_DAYS));
                    out.push('}');
                }
            }
            for (key, months) in INSPECTIONS.iter() {
                out.push(',');
                json::string(&mut out, &format!("{key}_until"));
                out.push(':');
                match v.get(&format!("{key}_on")).and_then(Value::as_str) {
                    Some(on) => json::string(&mut out, &end_of_month_after(day(name, on)?, *months)),
                    None => out.push_str("null"),
                }
            }
            out.push('}');
            Ok(out)
        }
        // `{"kind"}`: the largest bearing error 91.171 allows for it, for
        // the pickers that say it beside each kind.
        "vor_check_limit_deg" => {
            let kind = v.get("kind").and_then(Value::as_str).unwrap_or("");
            let limit = vor_limit_deg(kind)
                .ok_or_else(|| format!("{name}: \"kind\" is VOT, REPAIR_STATION, GROUND, AIRBORNE, RADIAL or DUAL, not {kind:?}"))?;
            let mut out = String::new();
            json::number(&mut out, limit);
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(name: &str, input: &str) -> String {
        call(name, &json::parse(input).unwrap()).unwrap()
    }

    #[test]
    fn an_annual_is_good_to_the_end_of_the_twelfth_month() {
        let due = ask("inspections_due", r#"{"annual_on":"2025-10-05","transponder_check_on":"2024-02-29"}"#);
        assert!(due.contains(r#""annual_until":"2026-10-31""#), "{due}");
        assert!(due.contains(r#""transponder_check_until":"2026-02-28""#), "{due}");
        assert!(due.contains(r#""elt_until":null"#), "{due}");
        let vor =
            ask("inspections_due", r#"{"vor_check":{"on":"2026-11-01","kind":"AIRBORNE","error_deg":-5},"hundred_hour_at_hours":1234.5}"#);
        assert!(vor.contains(r#""vor_check":{"limit_deg":6.0,"within":true,"until":"2026-12-01"}"#), "{vor}");
        assert!(vor.contains(r#""hundred_hour_due_at_hours":1334.5"#), "{vor}");
    }

    #[test]
    fn a_solo_endorsement_is_good_for_90_days() {
        let r = ask(
            "endorsement_records",
            r#"{"held":[{"code":"solo-first","on":"2026-01-01"},{"code":"solo-xc-training","on":"2026-02-01","make_model":"C172"}],"flight_on":"2026-04-02"}"#,
        );
        assert!(r.contains(r#""until":["2026-04-01",null]"#), "{r}");
        assert!(r.contains(r#""solo_until":"2026-04-01""#), "{r}");
        assert!(r.contains(r#""met":false,"detail":"Given 1 Jan 2026, not within the 90 days before 2 Apr 2026""#), "{r}");
        assert!(r.contains(r#""met":true,"detail":"Given 1 Feb 2026 for a C172""#), "{r}");
    }
}
