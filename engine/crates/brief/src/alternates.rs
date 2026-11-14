//! The IFR alternate: whether the destination needs one, and whether an
//! airport will do as one -- 14 CFR 91.169, moved from the planner's
//! wingtip.alternates (#482 phase 1), which keeps only the reading: each
//! field's instrument approach charts by name from the FAA's terminal
//! procedures (the d-TPP) and the worst its TAF forecasts over the window,
//! TEMPO and PROB groups included, with whether the TAF covers the whole
//! window (the engine's taf_window).
//!
//! **The destination** (91.169(b)): no alternate is needed where Part 97
//! publishes an instrument approach to it and the forecast, "for at least
//! 1 hour before and for 1 hour after the estimated time of arrival", is a
//! ceiling of at least 2,000 ft above the field and a visibility of at
//! least 3 sm -- "1-2-3" (91.169(b)(2)(i)). A TEMPO below either figure
//! asks for an alternate: the stricter reading, as the rule does not say
//! which. A forecast must "indicate" the figures, so an alternate is
//! needed where it does not: no TAF, a TAF that ends (or begins) inside
//! the window, a ceiling of unknown height, or no visibility forecast.
//!
//! **The alternate** (91.169(c)(1)): at the ETA there, a forecast at or
//! above its alternate minimums -- the ones its procedures publish, or
//! where none are (no "A" on its charts) the standard 600 ft and 2 sm for
//! a precision approach procedure (91.169(c)(1)(i)(A)), 800 ft and 2 sm
//! for a nonprecision one ((c)(1)(i)(B)). Which approaches are precision
//! is `precision_approach`. Where the FAA publishes nonstandard alternate
//! minimums for the field (its "ALTERNATE MINIMUMS" page in the d-TPP),
//! they may be higher or "NA", so the field is not called good: the pilot
//! is sent to that page. A forecast that does not show the minimums (no
//! TAF at the ETA, a ceiling of unknown height, no visibility) leaves the
//! pilot to look. An airport with no instrument approach (91.169(c)(2)) is
//! only good with a descent from the MEA and a landing under basic VFR,
//! which the planner does not work out: it is not called good.

use crate::airport_use::{self, Use};
use crate::figures::words::grouped;
use crate::json::{self, Value};
use wingtip_core::sort::StableSort;

/// 91.169(b)(2)(i): an hour either side of the ETA, at least 2,000 ft
/// above the field and 3 sm.
pub const DESTINATION_CEILING_FT: f64 = 2000.0;
pub const DESTINATION_VISIBILITY_SM: f64 = 3.0;
/// 91.169(b)(2)(i), for aircraft other than helicopters: "For at least 1
/// hour before and for 1 hour after the estimated time of arrival",
/// seconds either side of the ETA. (A helicopter's, (b)(2)(ii), is the ETA
/// to an hour after; the app plans airplanes.)
pub const DESTINATION_WINDOW_S: f64 = 3600.0;
/// 91.169(c)(1)(i)(A): the standard alternate minimums, ceiling and
/// visibility, "For a precision approach procedure" ...
pub const PRECISION_MINIMUMS: (f64, f64) = (600.0, 2.0);
/// ... and (B), "For a nonprecision approach procedure".
pub const NONPRECISION_MINIMUMS: (f64, f64) = (800.0, 2.0);

type R<T> = Result<T, String>;

/// Whether an instrument approach chart, by its d-TPP name ("ILS OR LOC
/// RWY 27", "RNAV (GPS) RWY 9", "GLS RWY 4R"), is a precision approach
/// procedure for 91.169(c)(1)(i)(A)'s 600-2. AIM 5-4-5 a.7(a): "Precision
/// Approach (PA) ... For example, PAR, ILS, and GLS are precision
/// approaches." LPV, LNAV/VNAV and an LDA with a glidepath are APV, not
/// precision (5-4-5 a.7(b)), so they take the nonprecision 800-2, which
/// is also how AIM 1-1-18 has a WAAS user plan an alternate: "flight
/// planning must be based on flying the RNAV (GPS) LNAV or circling minima
/// line ... part 91 non-precision weather requirements must be used for
/// planning." An "ILS OR LOC" chart carries the ILS, so it counts.
pub fn precision_approach(name: &str) -> bool {
    let name = name.trim().to_ascii_uppercase();
    ["ILS", "GLS", "PAR"].iter().any(|kind| name.starts_with(kind) && !name[kind.len()..].starts_with(|c: char| c.is_ascii_alphanumeric()))
}

/// A field's instrument approaches as the d-TPP lists them.
struct Approaches {
    any: bool,
    precision: bool,
    alternate_minimums_url: Option<String>,
}

/// The worst a TAF forecasts over the window, and the TAF as issued.
struct Forecast {
    ceiling_ft: Option<f64>,
    ceiling_unknown: bool,
    visibility_sm: Option<f64>,
    /// Whether the TAF's prevailing periods cover the whole window
    /// (taf_window's `covers`); missing is taken as not, the safer.
    covers: bool,
    raw: Option<String>,
}

fn as_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        _ => None,
    }
}

fn approaches(name: &str, v: &Value) -> R<Approaches> {
    let a = v.get("approaches").ok_or_else(|| format!("{name}: \"approaches\" is missing"))?;
    let names: Vec<&str> = a
        .get("names")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{name}: \"approaches.names\" is missing"))?
        .iter()
        .filter_map(Value::as_str)
        .filter(|n| !n.trim().is_empty())
        .collect();
    Ok(Approaches {
        any: !names.is_empty(),
        precision: names.iter().any(|n| precision_approach(n)),
        alternate_minimums_url: a.get("alternate_minimums_url").and_then(Value::as_str).filter(|u| !u.is_empty()).map(str::to_owned),
    })
}

fn forecast(v: &Value) -> Option<Forecast> {
    let f = v.get("forecast").filter(|f| matches!(f, Value::Object(_)))?;
    Some(Forecast {
        ceiling_ft: f.get("ceiling_ft").and_then(Value::as_f64),
        ceiling_unknown: f.get("ceiling_unknown").and_then(as_bool).unwrap_or(false),
        visibility_sm: f.get("visibility_sm").and_then(Value::as_f64),
        covers: f.get("covers").and_then(as_bool).unwrap_or(false),
        raw: f.get("raw").and_then(Value::as_str).map(str::to_owned),
    })
}

/// A visibility as Python's `:g` wrote it: six significant figures, no
/// trailing zeros ("2.5", "10", "0.25").
fn g(x: f64) -> String {
    if x == 0.0 || !x.is_finite() {
        return format!("{x}");
    }
    let digits = 5 - x.abs().log10().floor() as i32;
    let scale = 10f64.powi(digits.max(0));
    format!("{}", (x * scale).round() / scale)
}

fn opt(x: Option<f64>) -> Value {
    x.map_or(Value::Null, Value::Number)
}

fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

fn strings(xs: Vec<String>) -> Value {
    Value::Array(xs.into_iter().map(Value::String).collect())
}

/// Whether the destination needs an alternate (91.169(b)), and why.
fn destination(ident: &str, procs: &Approaches, forecast: Option<&Forecast>) -> Value {
    let mut reasons = Vec::new();
    if !procs.any {
        reasons.push(format!("{ident} has no instrument approach published (14 CFR 91.169(b)(1))."));
    }
    match forecast {
        None => reasons.push(format!("No TAF for {ident} covers an hour either side of the ETA.")),
        Some(f) => {
            // 91.169(b)(2)(i) asks the forecast to indicate the figures "for
            // at least 1 hour before and for 1 hour after" the ETA: a TAF
            // that ends, or begins, inside that window does not.
            if !f.covers {
                reasons.push(format!("The TAF for {ident} does not cover the whole hour either side of the ETA (14 CFR 91.169(b)(2)(i))."));
            }
            if let Some(c) = f.ceiling_ft.filter(|c| *c < DESTINATION_CEILING_FT) {
                reasons.push(format!("The TAF has a {} ft ceiling within an hour of the ETA: under 2,000 ft.", grouped(c)));
            }
            // A ceiling forecast with no height ("OVC///") is not known to
            // be 2,000 ft or more, so the forecast does not show what
            // 91.169(b)(2)(i) asks for (14 CFR 1.1 "ceiling").
            if f.ceiling_unknown {
                reasons.push("The TAF has a ceiling of unknown height within an hour of the ETA.".to_owned());
            }
            match f.visibility_sm {
                Some(vis) if vis < DESTINATION_VISIBILITY_SM => {
                    reasons.push(format!("The TAF has {} sm within an hour of the ETA: under 3 sm.", g(vis)))
                }
                Some(_) => {}
                // No visibility forecast indicates nothing, and the rule
                // asks the forecast to indicate at least 3 sm.
                None => reasons.push("The TAF gives no visibility within an hour of the ETA, so it does not show 3 sm.".to_owned()),
            }
        }
    }
    obj(vec![
        ("ident", Value::String(ident.to_owned())),
        ("approach", Value::Bool(procs.any)),
        ("ceiling_ft", opt(forecast.and_then(|f| f.ceiling_ft))),
        ("visibility_sm", opt(forecast.and_then(|f| f.visibility_sm))),
        ("taf", forecast.and_then(|f| f.raw.clone()).map_or(Value::Null, Value::String)),
        ("required", Value::Bool(!reasons.is_empty())),
        ("reasons", strings(reasons)),
    ])
}

/// Whether a field will do as the alternate at its ETA (91.169(c)):
/// `good` true, false, or null where the pilot has to look (nonstandard
/// minimums, no approach, no TAF), with why.
fn alternate(ident: &str, procs: &Approaches, forecast: Option<&Forecast>, usage: Use) -> Value {
    let minimums = if procs.precision { PRECISION_MINIMUMS } else { NONPRECISION_MINIMUMS };
    let mut reasons = Vec::new();
    let mut good = Some(true);
    if !procs.any {
        good = None;
        reasons.push(format!(
            "{ident} has no instrument approach: the forecast must allow a descent from the MEA and a landing under basic VFR (14 CFR 91.169(c)(2))."
        ));
    }
    match forecast {
        None => {
            good = None;
            reasons.push(format!("No TAF for {ident} covers the ETA there."));
        }
        Some(f) if procs.any => {
            // 91.169(c): the forecast must indicate the minimums "at the
            // estimated time of arrival at the alternate airport"; a TAF
            // not in force then says nothing of it.
            if !f.covers {
                good = None;
                reasons.push(format!("The TAF for {ident} does not cover the ETA there."));
            }
            if let Some(c) = f.ceiling_ft.filter(|c| *c < minimums.0) {
                good = Some(false);
                reasons.push(format!("The TAF has a {} ft ceiling at the ETA: under {} ft.", grouped(c), grouped(minimums.0)));
            }
            // A ceiling of unknown height is not known to meet 91.169(c)'s
            // minimums: the pilot has to look, as with no TAF.
            if f.ceiling_unknown && good == Some(true) {
                good = None;
                reasons.push("The TAF has a ceiling of unknown height at the ETA.".to_owned());
            }
            match f.visibility_sm {
                Some(vis) if vis < minimums.1 => {
                    good = Some(false);
                    reasons.push(format!("The TAF has {} sm at the ETA: under {} sm.", g(vis), g(minimums.1)));
                }
                Some(_) => {}
                // No visibility forecast is not one at or above the
                // minimums: the pilot has to look, as with no TAF.
                None => {
                    if good == Some(true) {
                        good = None;
                    }
                    reasons.push("The TAF gives no visibility at the ETA.".to_owned());
                }
            }
        }
        Some(_) => {}
    }
    // Whether the forecast meets the standard minimums, said apart from
    // `good`: a field with its own minimums may still be offered, for the
    // pilot to check against them.
    let meets_standard = good == Some(true) && procs.any;
    if procs.alternate_minimums_url.is_some() && good == Some(true) {
        good = None;
        reasons.push(format!(
            "{ident} publishes its own alternate minimums, higher than standard or not authorized for some approaches: check its alternate minimums page."
        ));
    }
    // Landed at only with leave (airport_use): 91.169(c) met, still the pilot's to check.
    if let Some(words) = usage.permission_line(ident, false) {
        good = good.filter(|g| !g);
        reasons.push(format!("{words}."));
    }
    obj(vec![
        ("ident", Value::String(ident.to_owned())),
        ("approach", Value::Bool(procs.any)),
        ("precision", Value::Bool(procs.precision)),
        (
            "minimums",
            if procs.any {
                obj(vec![("ceiling_ft", Value::Number(minimums.0)), ("visibility_sm", Value::Number(minimums.1))])
            } else {
                Value::Null
            },
        ),
        ("alternate_minimums_url", procs.alternate_minimums_url.clone().map_or(Value::Null, Value::String)),
        ("ceiling_ft", opt(forecast.and_then(|f| f.ceiling_ft))),
        ("visibility_sm", opt(forecast.and_then(|f| f.visibility_sm))),
        ("taf", forecast.and_then(|f| f.raw.clone()).map_or(Value::Null, Value::String)),
        ("good", good.map_or(Value::Null, Value::Bool)),
        ("meets_standard", Value::Bool(meets_standard)),
        ("reasons", strings(reasons)),
    ])
}

/// The fields offered as the alternate: those that will do, or that meet
/// the standard minimums and publish their own for the pilot to check --
/// those that will do first, then nearest first, `limit` of them.
fn ranked(checks: &[Value], limit: usize) -> Value {
    let mut kept: Vec<&Value> = checks
        .iter()
        .filter(|c| match c.get("good") {
            Some(Value::Bool(true)) => true,
            None | Some(Value::Null) => c.get("meets_standard").and_then(as_bool).unwrap_or(false),
            _ => false,
        })
        .collect();
    let distance = |c: &Value| c.get("distance_nm").and_then(Value::as_f64).unwrap_or(f64::INFINITY);
    kept.stable_sort_by(|a, b| {
        let not_good = |c: &Value| c.get("good") != Some(&Value::Bool(true));
        not_good(a).cmp(&not_good(b)).then(distance(a).total_cmp(&distance(b)))
    });
    Value::Array(kept.into_iter().take(limit).cloned().collect())
}

/// The window, unix seconds, a field's TAF is read over (the planner's
/// wingtip.alternates reads it, then asks `taf_window`): the destination's
/// an hour either side of the ETA (91.169(b)(2)(i)); an alternate's the
/// ETA there alone, "at the estimated time of arrival at the alternate
/// airport" (91.169(c)).
pub fn window(eta: f64, destination: bool) -> (f64, f64) {
    if destination {
        (eta - DESTINATION_WINDOW_S, eta + DESTINATION_WINDOW_S)
    } else {
        (eta, eta)
    }
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    let answer = match name {
        "ifr_alternate_window" => {
            let eta = v.get("eta").and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"eta\" is missing or not a number"))?;
            let destination = match v.get("for").and_then(Value::as_str) {
                Some("destination") => true,
                Some("alternate") => false,
                _ => return Err(format!("{name}: \"for\" is not \"destination\" or \"alternate\"")),
            };
            let (start, end) = window(eta, destination);
            obj(vec![("start", Value::Number(start)), ("end", Value::Number(end))])
        }
        "ifr_alternates_ranked" => {
            let checks = v.get("checks").and_then(Value::as_array).unwrap_or(&[]);
            let limit = v.get("limit").and_then(Value::as_f64).map_or(5, |l| l.max(0.0) as usize);
            ranked(checks, limit)
        }
        _ => {
            let ident = v.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"ident\" is missing"))?;
            let procs = approaches(name, v)?;
            let f = forecast(v);
            match name {
                "ifr_alternate_destination" => destination(ident, &procs, f.as_ref()),
                "ifr_alternate_check" => alternate(ident, &procs, f.as_ref(), airport_use::read(name, v)?),
                _ => return Err(format!("the engine has no rule called {name:?}")),
            }
        }
    };
    let mut out = String::new();
    json::value(&mut out, &answer);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_destinations_window_is_an_hour_either_side_and_an_alternates_its_eta() {
        assert_eq!(window(10_000.0, true), (6_400.0, 13_600.0));
        assert_eq!(window(10_000.0, false), (10_000.0, 10_000.0));
        let v = json::parse(r#"{"eta":7200,"for":"destination"}"#).unwrap();
        assert_eq!(call("ifr_alternate_window", &v).unwrap(), r#"{"start":3600.0,"end":10800.0}"#);
        assert!(call("ifr_alternate_window", &json::parse(r#"{"eta":1}"#).unwrap()).is_err());
    }

    #[test]
    fn visibilities_are_written_as_python_wrote_them() {
        assert_eq!(g(2.5), "2.5");
        assert_eq!(g(10.0), "10");
        assert_eq!(g(0.25), "0.25");
        assert_eq!(g(1.0 / 3.0), "0.333333");
    }

    #[test]
    fn a_tempo_under_1_2_3_asks_for_an_alternate() {
        let procs = Approaches { any: true, precision: true, alternate_minimums_url: None };
        let f = Forecast { ceiling_ft: Some(1500.0), ceiling_unknown: false, visibility_sm: Some(6.0), covers: true, raw: None };
        let d = destination("KDST", &procs, Some(&f));
        assert_eq!(d.get("required"), Some(&Value::Bool(true)));
    }

    #[test]
    fn precision_is_ils_gls_and_par_by_the_aim() {
        // AIM 5-4-5 a.7(a): "PAR, ILS, and GLS are precision approaches";
        // (b): "LDA with glidepath, LNAV/VNAV and LPV are APV approaches".
        for name in ["ILS OR LOC RWY 27", "ILS RWY 4R (SA CAT I)", "ILS Z RWY 9", "GLS RWY 4R", "PAR RWY 32", "ils rwy 9"] {
            assert!(precision_approach(name), "{name}");
        }
        for name in ["LOC RWY 27", "RNAV (GPS) RWY 9", "LDA/GLIDESLOPE RWY 19", "VOR RWY 3", "ILSX", "LOC BC RWY 9", "NDB OR GPS RWY 6"] {
            assert!(!precision_approach(name), "{name}");
        }
    }
}
