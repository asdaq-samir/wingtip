//! Under IFR, whether the flight is planned into icing
//! (apps/web/src/lib/icing.ts): a leg flown at or above the freezing level,
//! where the moisture icing needs is forecast -- cloud along the route, or
//! an icing AIRMET or SIGMET over it (the planner's `icing_possible`,
//! wingtip.altitude) -- with the pilot reports of icing near the route
//! (structural icing needs visible moisture at or below 0 °C, the Aviation
//! Weather Handbook, FAA-H-8083-28B ch. 20, Icing). Under VFR the flight stays
//! clear of cloud (14 CFR 91.155), and the freezing level is the altitude
//! reasoning's line alone. Freezing rain or drizzle (FZRA, FZDZ), which
//! ices an airplane out of cloud on any flight (AIM 7-1-20), is the weather
//! crate's `freezing_precip`, read from the METARs and TAFs.
//!
//! Where icing is possible but the freezing level is not known, the
//! flight's altitudes cannot be held to it: `gonogo_icing_unchecked` says
//! so, rather than nothing (the aviation audit's AV-7).

use super::calls::{truth, In};
use crate::figures::words::{feet, js_num};
use crate::json::{self, Value};

/// The altitude selection's say on icing: the freezing level (None not
/// known), whether the forecast is below freezing at its lowest altitude
/// (`at_or_below`), and whether the moisture is there (`possible`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Selection {
    pub freezing_level_ft: Option<f64>,
    pub possible: bool,
    pub at_or_below: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Icing {
    /// The highest altitude flown at or above the freezing level.
    pub altitude_ft: f64,
    pub freezing_level_ft: f64,
    pub at_or_below: bool,
    /// Pilot reports of icing near the route, of any intensity but none.
    pub reports: usize,
}

/// The highest altitude flown at or above the freezing level, the level,
/// whether it is at or below the lowest forecast, and the pilot reports
/// of icing near the route (each report's icing as sent, None for none
/// given); None where the flight is not planned into it.
pub fn icing_at_altitude(selection: &Selection, flown_ft: &[f64], pirep_icing: &[Option<String>]) -> Option<Icing> {
    let level = selection.freezing_level_ft?;
    if !selection.possible || flown_ft.is_empty() {
        return None;
    }
    let highest = flown_ft.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if !selection.at_or_below && highest < level {
        return None;
    }
    // A report's intensity as sent: NEG (and NEGclr) is none.
    let reports =
        pirep_icing.iter().filter(|i| i.as_deref().is_some_and(|i| !i.is_empty() && !i.to_uppercase().starts_with("NEG"))).count();
    Some(Icing { altitude_ft: highest, freezing_level_ft: level, at_or_below: selection.at_or_below, reports })
}

/// In a line, for the Go / No-Go.
pub fn icing_line(icing: &Icing) -> String {
    let near = match icing.reports {
        0 => String::new(),
        1 => "; 1 pilot report of icing near the route".into(),
        n => format!("; {} pilot reports of icing near the route", js_num(n as f64)),
    };
    format!(
        "Icing possible at {}: the freezing level {} {}, in cloud{near}",
        feet(icing.altitude_ft),
        if icing.at_or_below { "at or below" } else { "at" },
        feet(icing.freezing_level_ft)
    )
}

/// The finding and its line as JSON, null where there is none.
pub fn icing_json(icing: Option<&Icing>) -> String {
    let Some(i) = icing else { return "null".into() };
    let mut out = String::from("{\"altitude_ft\":");
    json::number(&mut out, i.altitude_ft);
    out.push_str(",\"freezing_level_ft\":");
    json::number(&mut out, i.freezing_level_ft);
    out.push_str(&format!(",\"at_or_below\":{},\"reports\":{},\"line\":", i.at_or_below, i.reports));
    json::string(&mut out, &icing_line(i));
    out.push('}');
    out
}

/// The altitude selection's say on icing, from its JSON (`selection`, the
/// planner's AltitudeBreakdown members); nothing said where it is missing.
pub(crate) fn selection_of(i: In, v: &Value) -> Result<Selection, String> {
    Ok(match i.obj(v, "selection")? {
        None => Selection::default(),
        Some(s) => Selection {
            freezing_level_ft: i.opt_num(s, "freezing_level_ft")?,
            possible: truth(s, "icing_possible"),
            at_or_below: truth(s, "freezing_level_at_or_below"),
        },
    })
}

/// Why icing was not checked, where it was not: the moisture is forecast
/// (`possible`) and altitudes are flown, but the freezing level is not
/// known, so no altitude can be held to it. Structural icing needs
/// visible moisture at or below 0 °C (FAA-H-8083-28B ch. 20); with no
/// level, the safer word is that it was not checked, never nothing.
pub fn icing_unchecked(selection: &Selection, flown_ft: &[f64]) -> Option<&'static str> {
    (selection.possible && selection.freezing_level_ft.is_none() && !flown_ft.is_empty())
        .then_some("Icing not checked: freezing level not known")
}

/// `gonogo_icing_unchecked`: its line, or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let i = In { name };
    let mut out = String::new();
    json::opt_string(&mut out, icing_unchecked(&selection_of(i, v)?, &i.nums(v, "flown_ft")?));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icing_possible_with_no_freezing_level_is_said_not_checked() {
        let unknown = Selection { freezing_level_ft: None, possible: true, at_or_below: false };
        assert_eq!(icing_unchecked(&unknown, &[8000.0]), Some("Icing not checked: freezing level not known"));
        assert_eq!(icing_at_altitude(&unknown, &[8000.0], &[]), None);
        // No moisture, or a level known, or nothing flown: nothing to say here.
        assert_eq!(icing_unchecked(&Selection { possible: false, ..unknown }, &[8000.0]), None);
        assert_eq!(icing_unchecked(&Selection { freezing_level_ft: Some(6000.0), ..unknown }, &[8000.0]), None);
        assert_eq!(icing_unchecked(&unknown, &[]), None);
    }
}
