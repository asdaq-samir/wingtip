//! `gonogo_input`: the Go / No-Go's input put together from the briefing,
//! the nav log and the loading -- gonogo_brief's weather, airspace,
//! altitude, fuel, runways and balance, in its words -- one copy for the
//! web (features/brief/verdictInput) and the planner (app.gonogo.flight),
//! which each built the same sections from the same answers (round 4's
//! engine audit). The figures are other rules' (gonogo_route_figures'
//! fuel and TFRs, gonogo_runway_findings' fields, the minimums', the
//! icing's); here they are only put in their places, with what each
//! section waits on and the words a row says.
//!
//! - Under IFR "VFR flight not recommended" is no reason not to go: its
//!   weather check is the destination's and the alternate's (14 CFR
//!   91.169), not VFR's minimums, so its reasons are dropped.
//! - A source that did not answer is said by name; under IFR the forecast
//!   icing not had, and a ceiling reported or forecast with no height, are
//!   said unchecked too: not met, not missed (14 CFR 91.103, all the
//!   available information).
//! - The loading is balanced only with the pilot's own load (the POH's
//!   section 6; 14 CFR 91.9(a)): with none, "give your load" (no_load),
//!   never the POH's sample airplane as the flight's.

use super::calls::{truth, In};
use super::weight_balance::{takeoff_words, Condition};
use crate::figures::words::{alt_ft, ceiling_and_visibility, flight_level, pounds};
use crate::json::{self, Value};

type R<T> = Result<T, String>;

const NAME: &str = "gonogo_input";

/// What each weather source is called when a pilot is told it could not
/// be checked (the briefing's `weather_unavailable`).
fn source_label(source: &str) -> &str {
    match source {
        "hazards" => "SIGMETs",
        "forecast" => "the TAF forecast",
        "metars" => "current METARs",
        "tfrs" => "TFRs",
        "pireps" => "pilot reports",
        "gairmets" => "G-AIRMETs",
        other => other,
    }
}

/// An altitude plan's name, "Fastest": the planner's four
/// (wingtip.navlog.altitude_profiles).
fn plan_name(kind: &str) -> &str {
    match kind {
        "lowest" => "Lowest",
        "highest" => "Highest",
        "fastest" => "Fastest",
        "economical" => "Economical",
        other => other,
    }
}

fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

fn strings(items: Vec<String>) -> Value {
    Value::Array(items.into_iter().map(Value::String).collect())
}

fn opt_string(s: Option<String>) -> Value {
    s.map_or(Value::Null, Value::String)
}

fn opt_number(n: Option<f64>) -> Value {
    n.map_or(Value::Null, Value::Number)
}

/// The altitude flown, as the FL chip says it: a pilot's own "FL-045, your
/// own"; a plan's altitudes, one figure or its lowest and highest, and its
/// name.
fn flown_words(i: In, nav: &Value) -> R<String> {
    let flown = i.opt_str(nav, "flown")?.unwrap_or_default();
    if flown == "custom" {
        return Ok(format!("{}, your own", flight_level(i.opt_num(nav, "altitude_ft")?)));
    }
    let chosen = i.list(nav, "options")?.iter().find(|o| o.get("kind").and_then(Value::as_str) == Some(flown.as_str()));
    let alts = match chosen {
        Some(o) => i.list(o, "steps")?.iter().map(|s| i.num(s, "altitude_ft")).collect::<R<Vec<f64>>>()?,
        None => i.opt_num(nav, "altitude_ft")?.into_iter().collect(),
    };
    let range = match (alts.iter().copied().reduce(f64::min), alts.iter().copied().reduce(f64::max)) {
        (Some(low), Some(high)) if low == high => format!("{} ft", alt_ft(Some(low))),
        (Some(low), Some(high)) => format!("{}–{} ft", alt_ft(Some(low)), alt_ft(Some(high))),
        _ => "No altitude".to_owned(),
    };
    Ok(match chosen.and_then(|o| o.get("kind")).and_then(Value::as_str) {
        Some(kind) => format!("{range} · {} plan", plan_name(kind)),
        None => range,
    })
}

/// `gonogo_input`: the sections gonogo_brief reads, from the flight's facts
/// (the contract file lists them).
pub fn call(name: &str, v: &Value) -> R<String> {
    if name != NAME {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let i = In { name };
    let briefed = truth(v, "briefed");
    let failed = i.opt_str(v, "failed")?;
    let failed_said = failed.as_deref().is_some_and(|f| !f.is_empty());
    let ifr = truth(v, "ifr");
    let unavailable = i.strings(v, "weather_unavailable")?;
    let nav = i.obj(v, "nav")?;
    let planned = nav.is_some();
    let figures = i.obj(v, "route_figures")?.map_or_else(|| i.err("route_figures", "is missing"), Ok)?;

    let mut unchecked: Vec<String> = unavailable.iter().filter(|s| *s != "tfrs").map(|s| source_label(s).to_owned()).collect();
    if ifr && truth(v, "icing_unchecked") {
        unchecked.push("the forecast icing".into());
    }
    let ceilings = i.strings(v, "ceilings_unknown")?;
    if !ceilings.is_empty() {
        unchecked.push(format!("the ceiling at {}", ceilings.join(", ")));
    }
    let worst = match i.obj(v, "forecast")? {
        Some(f) => {
            let (c, s) = (i.opt_num(f, "min_ceiling_ft")?, i.opt_num(f, "min_visibility_sm")?);
            (c.is_some() || s.is_some()).then(|| ceiling_and_visibility(c, s))
        }
        None => None,
    };
    let icing = i.strings(v, "icing")?;
    let weather = obj(vec![
        ("pending", Value::Bool(!briefed && !failed_said)),
        ("failed", opt_string(failed)),
        ("vfr_not_recommended", strings(if ifr { vec![] } else { i.strings(v, "vfr_not_recommended")? })),
        ("under_minimums", strings(i.strings(v, "under_minimums")?)),
        ("icing", opt_string((!icing.is_empty()).then(|| icing.join("; ")))),
        ("hazards", strings(i.strings(v, "hazards")?)),
        ("unchecked", strings(unchecked)),
        ("worst", opt_string(worst)),
        ("terminal_alerts", strings(i.strings(v, "terminal_alerts")?)),
        ("flow_programs", strings(i.strings(v, "flow_programs")?)),
        ("ifr", Value::Bool(ifr)),
    ]);
    let airspace = obj(vec![
        ("pending", Value::Bool(!briefed && !failed_said)),
        ("unchecked", Value::Bool(failed_said || unavailable.iter().any(|s| s == "tfrs"))),
        ("in_force", strings(i.strings(figures, "tfrs_in_force")?)),
        ("near", Value::Number(i.opt_num(figures, "tfrs_near")?.unwrap_or(0.0))),
        ("special_use", Value::Array(i.list(v, "special_use")?.to_vec())),
    ]);
    let legs_ft = i.nums(v, "legs_ft")?;
    let aircraft = v.get("aircraft").filter(|a| matches!(a, Value::Object(_)));
    let altitude = obj(vec![
        ("pending", Value::Bool(!planned)),
        ("problem", opt_string(i.opt_str(v, "problem")?)),
        (
            "cautions",
            strings(match nav {
                Some(n) => i.list(n, "cautions")?.iter().map(|c| i.strings(c, "reasons")).collect::<R<Vec<_>>>()?.concat(),
                None => vec![],
            }),
        ),
        ("flown", opt_string(nav.map(|n| flown_words(i, n)).transpose()?)),
        // The engine's oxygen finding (14 CFR 91.211(a)): the highest leg, and the airplane's oxygen.
        ("highest_ft", opt_number(legs_ft.iter().copied().reduce(f64::max))),
        ("oxygen", Value::Bool(aircraft.is_some_and(|a| truth(a, "supplemental_oxygen") || truth(a, "pressurized")))),
    ]);
    let fuel = obj(vec![
        ("pending", Value::Bool(!truth(v, "totals"))),
        ("margin_gal", opt_number(i.opt_num(figures, "least_margin_gal")?)),
        ("required_gal", opt_number(i.opt_num(figures, "required_gal")?)),
        ("reserve_min", opt_number(i.opt_num(figures, "reserve_min")?)),
        ("ifr", Value::Bool(ifr)),
    ]);
    let runways = json::parse(&super::runway_findings::call(
        "gonogo_runway_findings",
        &obj(vec![
            ("planned", Value::Bool(planned)),
            ("briefed", Value::Bool(briefed)),
            ("aircraft", aircraft.cloned().unwrap_or(Value::Null)),
            ("checks", Value::Array(i.list(v, "runway_checks")?.to_vec())),
        ]),
    )?)?;
    let loading = truth(v, "loading");
    let loaded = i.obj(v, "loaded")?.filter(|_| planned);
    let takeoff = match loaded {
        Some(l) => {
            let t = i.obj(l, "takeoff")?.map_or_else(|| i.err("takeoff", "is missing"), Ok)?;
            let weight_lb = i.num(t, "weight_lb")?;
            // No centre of gravity where the weight is none (the engine's
            // arm is null then), said so, as the pages say it.
            Some(match i.opt_num(t, "arm_in")? {
                Some(arm_in) => takeoff_words(&Condition { weight_lb, arm_in }),
                None => format!("{} at no CG", pounds(weight_lb)),
            })
        }
        None => None,
    };
    let balance = obj(vec![
        ("pending", Value::Bool(!planned)),
        ("worked", Value::Bool(loading && loaded.is_some())),
        ("no_load", Value::Bool(loading && i.obj(v, "loaded")?.is_none())),
        ("problems", strings(loaded.map(|l| i.strings(l, "problems")).transpose()?.unwrap_or_default())),
        ("takeoff", opt_string(takeoff)),
    ]);
    let mut out = String::new();
    json::value(
        &mut out,
        &obj(vec![
            ("weather", weather),
            ("airspace", airspace),
            ("altitude", altitude),
            ("fuel", fuel),
            ("runways", runways),
            ("balance", balance),
        ]),
    );
    Ok(out)
}
