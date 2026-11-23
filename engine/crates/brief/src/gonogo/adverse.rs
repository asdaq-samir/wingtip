//! The Brief's Adverse Conditions rows (`gonogo_adverse_rows`): the
//! standard briefing's first element, "significant meteorological and/or
//! aeronautical information that might influence the pilot to alter or
//! cancel the proposed flight" (AIM 7-1-5(b)(1)), as 1-800-WX-BRIEF and
//! ForeFlight open on it. Under the Brief's findings, at most three rows,
//! drawn only when there is any (the Brief audit's option 2, the owner
//! 2026-11-21).
//!
//! What counts, met on the route while the airplane is there (the
//! planner's OnRoute `when`, "during"; one with no valid times, a pilot
//! report's, as met):
//!
//! - a TFR the route goes through: flight in it is prohibited unless the
//!   NOTAM allows it (14 CFR 91.137-91.145), a stop;
//! - a Convective SIGMET, weather "hazardous to all categories of
//!   aircraft", or a SIGMET, weather "expected to affect the safety of
//!   aircraft operations" (AIM 7-1-6), a stop;
//! - a Center Weather Advisory (AIM 7-1-6) and an urgent pilot report, the
//!   UUA filed for hazardous weather such as severe turbulence or icing
//!   (AIM 7-1-18), cautions;
//! - an AIRMET or G-AIRMET, weather "at intensities lower than those which
//!   require the issuance of a SIGMET" (AIM 7-1-6), a caution.
//!
//! In that order -- the stops first, then the AIM's own sequence from the
//! prohibition to the light-aircraft advisory -- and, of a kind, the one met
//! first along the route first. A TFR only near the route, a routine PIREP
//! and a hazard before or after the flight stay in their pages.

use super::calls::{truth, In};
use crate::json::{self, Value};
use wingtip_core::sort::StableSort;

/// At most this many rows, as the findings over them (decision 0012).
pub const ADVERSE_MAX: usize = 3;

/// One advisory as the hosts read it from the briefing: its product
/// (OnRoute's `source`: "TFR", "Convective SIGMET", "SIGMET", "CWA",
/// "PIREP", "AIRMET", "G-AIRMET"), its name in words (the hazard, a TFR's
/// NOTAM and title, a PIREP's conditions), where and when the flight meets
/// it, and for a TFR whether the route goes through it, for a PIREP
/// whether it is urgent.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Advisory {
    pub source: String,
    pub name: Option<String>,
    pub when: Option<String>,
    pub enter: Option<String>,
    pub valid_to: Option<String>,
    pub issued: Option<String>,
    pub from_nm: Option<f64>,
    pub legs: Vec<f64>,
    pub crosses: bool,
    pub urgent: bool,
}

/// A row: its title, finding, the page and section it opens, and the time
/// a host writes after it -- "at" (a TFR: when the flight meets it),
/// "until" (an advisory's end) or "reported" (a pilot report's time).
#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub source: String,
    pub title: String,
    pub finding: &'static str,
    pub tab: &'static str,
    pub section: &'static str,
    pub time_kind: Option<&'static str>,
    pub time: Option<String>,
    pub legs: Vec<f64>,
}

/// Each product's place in the order, its finding, and None for one that
/// is not an adverse condition at all.
fn rank(a: &Advisory) -> Option<(usize, &'static str)> {
    match a.source.as_str() {
        "TFR" if a.crosses => Some((0, "stop")),
        "Convective SIGMET" => Some((1, "stop")),
        "SIGMET" => Some((2, "stop")),
        "CWA" => Some((3, "caution")),
        "PIREP" if a.urgent => Some((4, "caution")),
        "AIRMET" | "G-AIRMET" => Some((5, "caution")),
        _ => None,
    }
}

fn title(a: &Advisory) -> String {
    let name = a.name.as_deref().map(str::trim).filter(|n| !n.is_empty());
    let lead = match a.source.as_str() {
        "PIREP" => "Urgent pilot report",
        "CWA" => "Center weather advisory",
        s => s,
    };
    match (a.source.as_str(), name) {
        // The convective SIGMET's hazard is its name ("Convective").
        ("Convective SIGMET", _) | (_, None) => lead.to_owned(),
        ("TFR", Some(n)) => format!("TFR {n}"),
        (_, Some(n)) => format!("{lead}: {n}"),
    }
}

/// The adverse conditions on the route, in order, at most ADVERSE_MAX,
/// and how many more there are.
pub fn adverse_rows(all: &[Advisory]) -> (Vec<Row>, usize) {
    let mut met: Vec<(usize, &'static str, &Advisory)> =
        all.iter().filter(|a| matches!(a.when.as_deref(), None | Some("during"))).filter_map(|a| rank(a).map(|(r, f)| (r, f, a))).collect();
    let along = |a: &Advisory| a.from_nm.unwrap_or(f64::INFINITY);
    met.stable_sort_by(|x, y| x.0.cmp(&y.0).then(along(x.2).total_cmp(&along(y.2))));
    let more = met.len().saturating_sub(ADVERSE_MAX);
    let rows = met
        .into_iter()
        .take(ADVERSE_MAX)
        .map(|(_, finding, a)| {
            let tfr = a.source == "TFR";
            let (time_kind, time) = if tfr {
                (a.enter.as_ref().map(|_| "at"), a.enter.clone())
            } else if a.source == "PIREP" {
                (a.issued.as_ref().map(|_| "reported"), a.issued.clone())
            } else {
                (a.valid_to.as_ref().map(|_| "until"), a.valid_to.clone())
            };
            Row {
                source: a.source.clone(),
                title: title(a),
                finding,
                tab: if tfr { "preflight" } else { "enroute" },
                section: if tfr { "TFRs & Special Use" } else { "Adverse Conditions" },
                time_kind,
                time,
                legs: a.legs.clone(),
            }
        })
        .collect();
    (rows, more)
}

/// `gonogo_adverse_rows` by name.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let i = In { name };
    let all = i
        .list(v, "advisories")?
        .iter()
        .map(|a| {
            Ok(Advisory {
                source: i.str(a, "source")?,
                name: i.opt_str(a, "name")?,
                when: i.opt_str(a, "when")?,
                enter: i.opt_str(a, "enter")?,
                valid_to: i.opt_str(a, "valid_to")?,
                issued: i.opt_str(a, "issued")?,
                from_nm: i.opt_num(a, "from_nm")?,
                legs: i.nums(a, "legs")?,
                crosses: truth(a, "crosses"),
                urgent: truth(a, "urgent"),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let (rows, more) = adverse_rows(&all);
    let mut out = String::from("{\"rows\":[");
    for (n, r) in rows.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        for (k, s) in [("{\"source\":", r.source.as_str()), (",\"title\":", r.title.as_str()), (",\"finding\":", r.finding)] {
            out.push_str(k);
            json::string(&mut out, s);
        }
        for (k, s) in [(",\"tab\":", r.tab), (",\"section\":", r.section)] {
            out.push_str(k);
            json::string(&mut out, s);
        }
        out.push_str(",\"time_kind\":");
        json::opt_string(&mut out, r.time_kind);
        out.push_str(",\"time\":");
        json::opt_string(&mut out, r.time.as_deref());
        out.push_str(",\"legs\":[");
        out.push_str(&r.legs.iter().map(|l| format!("{l}")).collect::<Vec<_>>().join(","));
        out.push_str("]}");
    }
    out.push_str(&format!("],\"more\":{more}}}"));
    Ok(out)
}

#[cfg(test)]
mod tests;
