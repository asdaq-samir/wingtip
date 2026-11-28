//! The route's own figures the Go / No-Go's fuel and airspace findings
//! are put together from, out of the nav log's totals and the TFRs the
//! briefing lists: one copy, where the web (useFlightBriefing) and the
//! planner (app.gonogo.flight) each worked them out before asking for the
//! verdict, two copies of rules that must agree.
//!
//! - The least fuel margin over the flights: the whole route's and each
//!   flight's between fuel stops, the least of them, as the tightest leg
//!   is what the reserve rule is held to (14 CFR 91.151(a): enough fuel to
//!   the first point of intended landing and then 30 minutes by day, 45 by
//!   night; 91.167 under IFR).
//! - The fuel required: the route's, else the most any one flight needs.
//! - The reserve, minutes: the route's, else its first flight's.
//! - The TFRs: those the route crosses while they are in force (14 CFR
//!   91.137-91.145) and how many more the briefing lists near it. In
//!   force is the briefing's word where it placed the TFR on the legs
//!   (`on_route.when`, "during"), else its window, widened by half an hour
//!   either way, at the time the flight gets there (pass_times), else --
//!   that time not known -- in force: the safer side. With no `tfrs` sent,
//!   none.
//! - Under IFR "VFR flight not recommended" is no reason not to go: its
//!   weather check is the destination's and the alternate's (14 CFR
//!   91.169), so its reasons are dropped (vfr_flown, gonogo_input's too).
//! - The hazards the risk counts: the SIGMETs and G-AIRMETs by name, none
//!   counted where both sources failed (said unchecked, not counted as
//!   none found and not as hazards either).

use super::calls::In;
use crate::json::{self, Value};

/// A flight's or the route's totals, as the nav log gives them.
#[derive(Default, Clone, Copy)]
pub struct Fuel {
    pub margin_gal: Option<f64>,
    pub required_gal: Option<f64>,
    pub reserve_min: Option<f64>,
}

/// What the findings are given: the least margin, the fuel required and
/// the reserve.
#[derive(Debug, PartialEq)]
pub struct FuelFigures {
    pub least_margin_gal: Option<f64>,
    pub required_gal: Option<f64>,
    pub reserve_min: Option<f64>,
}

pub fn fuel_figures(route: Option<Fuel>, hops: &[Fuel]) -> FuelFigures {
    let route = route.unwrap_or_default();
    let least_margin_gal = std::iter::once(route.margin_gal).chain(hops.iter().map(|h| h.margin_gal)).flatten().reduce(f64::min);
    let required_gal = route
        .required_gal
        .or_else(|| (!hops.is_empty()).then(|| hops.iter().map(|h| h.required_gal.unwrap_or(0.0)).fold(f64::MIN, f64::max)));
    let reserve_min = route.reserve_min.or_else(|| hops.first().and_then(|h| h.reserve_min));
    FuelFigures { least_margin_gal, required_gal, reserve_min }
}

fn num(v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("gonogo_route_figures: \"{key}\" is not a number")),
    }
}

fn fuel_of(v: &Value) -> Result<Fuel, String> {
    Ok(Fuel { margin_gal: num(v, "fuel_margin_gal")?, required_gal: num(v, "fuel_required_gal")?, reserve_min: num(v, "reserve_min")? })
}

/// The reasons for "VFR flight not recommended" that count: none under
/// IFR (14 CFR 91.169 is its weather check), the briefing's under VFR.
pub fn vfr_flown(ifr: bool, reasons: Vec<String>) -> Vec<String> {
    if ifr {
        Vec::new()
    } else {
        reasons
    }
}

/// Whether a TFR the route crosses is in force as the flight passes it
/// (the module's head): `legs` each (distance_nm, ete_min), `depart_us`
/// the departure, microseconds since 1970.
fn tfr_in_force(t: &Value, legs: &[(f64, Option<f64>)], depart_us: Option<f64>) -> bool {
    if let Some(when) = t.get("on_route").and_then(|o| o.get("when")).and_then(Value::as_str) {
        return when == "during";
    }
    let along = t.get("along_track_nm").and_then(Value::as_f64).unwrap_or(0.0);
    let Some(at_us) = depart_us.zip(super::pass_times::pass_minutes(legs, along)).map(|(d, m)| d + m * 60_000_000.0) else {
        return true;
    };
    let us = |key| t.get(key).and_then(Value::as_str).and_then(wingtip_core::time::parse_iso).map(|s| s * 1_000_000);
    super::pass_times::tfr_when(at_us as i64, us("effective"), us("expires")) == "in-force"
}

/// The NOTAM ids of the TFRs the route crosses in force, and how many the
/// briefing lists, from `tfrs`; none where none are sent.
fn tfrs_of(i: In, v: &Value) -> Result<(Vec<String>, f64), String> {
    let Some(Value::Array(tfrs)) = v.get("tfrs") else {
        return Ok((Vec::new(), 0.0));
    };
    let legs =
        i.list(v, "legs")?.iter().map(|l| Ok((i.num(l, "distance_nm")?, i.opt_num(l, "ete_min")?))).collect::<Result<Vec<_>, String>>()?;
    let depart_us = num(v, "depart_us")?;
    let mut crossed = Vec::new();
    for t in tfrs {
        if super::calls::truth(t, "crosses") && tfr_in_force(t, &legs, depart_us) {
            crossed.push(i.opt_str(t, "notam_id")?.unwrap_or_default());
        }
    }
    Ok((crossed, tfrs.len() as f64))
}

/// `gonogo_route_figures` (its contract file lists the input): the fuel's
/// figures, the TFRs in force and near, the reasons for VFR not
/// recommended that count and the hazards the risk counts.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "gonogo_route_figures" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let i = In { name };
    let totals = v.get("totals").filter(|t| !matches!(t, Value::Null));
    let route = totals.map(fuel_of).transpose()?;
    let mut hops = Vec::new();
    if let Some(Value::Array(listed)) = totals.and_then(|t| t.get("hops")) {
        for hop in listed {
            hops.push(fuel_of(hop.get("totals").unwrap_or(&Value::Null))?);
        }
    }
    let figures = fuel_figures(route, &hops);
    let (crossed, listed) = tfrs_of(i, v)?;
    let vnr = vfr_flown(super::calls::truth(v, "ifr"), i.strings(v, "vfr_not_recommended")?);
    let unavailable = i.strings(v, "weather_unavailable")?;
    let unread = |s: &str| unavailable.iter().any(|u| u == s);
    let hazards = if unread("hazards") && unread("gairmets") { 0 } else { i.strings(v, "hazards")?.len() };
    let mut out = String::from("{\"least_margin_gal\":");
    json::opt_number(&mut out, figures.least_margin_gal);
    out.push_str(",\"required_gal\":");
    json::opt_number(&mut out, figures.required_gal);
    out.push_str(",\"reserve_min\":");
    json::opt_number(&mut out, figures.reserve_min);
    out.push_str(",\"tfrs_in_force\":");
    super::strings(&mut out, &crossed);
    out.push_str(",\"tfrs_near\":");
    json::number(&mut out, (listed - crossed.len() as f64).max(0.0));
    out.push_str(",\"vfr_not_recommended\":");
    super::strings(&mut out, &vnr);
    out.push_str(",\"hazard_count\":");
    json::number(&mut out, hazards as f64);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{call, fuel_figures, Fuel, FuelFigures};
    use crate::json;

    fn asked(v: &str) -> json::Value {
        json::parse(&call("gonogo_route_figures", &json::parse(v).unwrap()).unwrap()).unwrap()
    }

    #[test]
    fn a_crossed_tfr_counts_in_force_by_the_briefings_word_else_at_the_pass() {
        // Departing 12:00Z, one 60 nm leg of 30 min: 30 nm along is 12:15Z.
        let base = r#""legs": [{"distance_nm": 60, "ete_min": 30}], "depart_us": 1793620800000000"#;
        let tfr = |extra: &str| {
            format!(r#"{{"totals": null, {base}, "tfrs": [{{"notam_id": "6/1111", "crosses": true, "along_track_nm": 30{extra}}}]}}"#)
        };
        let ids = |v: &json::Value| v.get("tfrs_in_force").unwrap().clone();
        // The briefing's word first (on_route.when).
        assert_eq!(ids(&asked(&tfr(r#", "on_route": {"when": "after"}"#))), json::parse("[]").unwrap());
        assert_eq!(ids(&asked(&tfr(r#", "on_route": {"when": "during"}"#))), json::parse(r#"["6/1111"]"#).unwrap());
        // Starting at 12:45Z: 30 minutes past the pass is still in force (the
        // margin), 31 is not.
        assert_eq!(ids(&asked(&tfr(r#", "effective": "2026-11-02T12:45:00Z""#))), json::parse(r#"["6/1111"]"#).unwrap());
        let later = asked(&tfr(r#", "effective": "2026-11-02T12:46:00Z""#));
        assert_eq!(ids(&later), json::parse("[]").unwrap());
        assert_eq!(later.get("tfrs_near").and_then(json::Value::as_f64), Some(1.0));
        // A leg that cannot be flown: the pass not known, in force.
        let unflown = r#"{"totals": null, "legs": [{"distance_nm": 60, "ete_min": null}], "depart_us": 0,
            "tfrs": [{"notam_id": "6/2", "crosses": true, "along_track_nm": 30, "effective": "2030-01-01T00:00:00Z"}]}"#;
        assert_eq!(ids(&asked(unflown)), json::parse(r#"["6/2"]"#).unwrap());
    }

    #[test]
    fn under_ifr_vfr_not_recommended_drops_and_hazards_both_unread_count_none() {
        let v = asked(
            r#"{"totals": null, "ifr": true, "vfr_not_recommended": ["KDLH IFR"], "hazards": ["IFR G-AIRMET"], "weather_unavailable": ["hazards", "gairmets"]}"#,
        );
        assert_eq!(v.get("vfr_not_recommended"), Some(&json::parse("[]").unwrap()));
        assert_eq!(v.get("hazard_count").and_then(json::Value::as_f64), Some(0.0));
        let v = asked(
            r#"{"totals": null, "vfr_not_recommended": ["KDLH IFR"], "hazards": ["IFR G-AIRMET"], "weather_unavailable": ["hazards"]}"#,
        );
        assert_eq!(v.get("vfr_not_recommended"), Some(&json::parse(r#"["KDLH IFR"]"#).unwrap()));
        assert_eq!(v.get("hazard_count").and_then(json::Value::as_f64), Some(1.0));
    }

    const fn fuel(margin: Option<f64>, required: Option<f64>, reserve: Option<f64>) -> Fuel {
        Fuel { margin_gal: margin, required_gal: required, reserve_min: reserve }
    }

    #[test]
    fn the_least_margin_over_the_route_and_its_flights() {
        let got = fuel_figures(Some(fuel(Some(12.0), Some(30.0), Some(30.0))), &[fuel(Some(4.5), None, None), fuel(Some(9.0), None, None)]);
        assert_eq!(got, FuelFigures { least_margin_gal: Some(4.5), required_gal: Some(30.0), reserve_min: Some(30.0) });
    }

    #[test]
    fn with_no_route_figure_the_flights_say_it() {
        // Required: the most any flight needs; the reserve: the first's.
        let got = fuel_figures(Some(fuel(None, None, None)), &[fuel(None, Some(18.0), Some(45.0)), fuel(None, Some(22.0), Some(30.0))]);
        assert_eq!(got, FuelFigures { least_margin_gal: None, required_gal: Some(22.0), reserve_min: Some(45.0) });
    }

    #[test]
    fn nothing_known_is_nothing() {
        assert_eq!(fuel_figures(None, &[]), FuelFigures { least_margin_gal: None, required_gal: None, reserve_min: None });
    }
}
