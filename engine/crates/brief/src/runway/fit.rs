//! How well a runway end fits the airplane today, said once: the finding
//! (stop, caution, unknown, ok) and its one reason, the worst first. FPL's
//! runway chips (runway_end_fit) and the Brief's runway check at each field
//! (gonogo_runway_checks, the glance's rows and the Go / No-Go's item) both
//! answer with it, so the same end is never amber in one and fine in the
//! other (the rules audit, 2026-11-27).
//!
//! The order, worst first:
//!
//! - **short** (stop): the distance over a 50 ft obstacle is more than the
//!   runway available. 14 CFR 91.103(b)(1) has the pilot know "runway
//!   lengths at airports of intended use" and the airplane's "takeoff and
//!   landing distance data".
//! - **crosswind** (caution): past the POH's demonstrated crosswind, which
//!   is not a limitation but the most the airplane was shown to handle
//!   (FAA-H-8083-25C, chapter 11; the POH's section 4).
//! - **tailwind** (caution): any wind behind the end. AIM 4-3-6c has ATC
//!   assign the runway most nearly aligned with the wind and puts
//!   "tailwind and crosswind considerations" ahead of capacity and noise;
//!   the POH's distances grow with it (the C172S POH, section 5's notes:
//!   10 per cent for each 2 knots), so an end with the wind behind it is
//!   worth a look even where it still fits.
//! - **close** (caution): fits, but with less than SAFO 19001's 15 per cent
//!   to spare (performance::DISTANCE_MARGIN).
//! - **beyond** (caution): read past the POH's table, higher, hotter,
//!   heavier or more tailwind than it goes, so its figures are the table's
//!   edge and shorter than the airplane will need (FAA-H-8083-25C, chapter
//!   11: performance charts hold only within their stated conditions).
//! - **unknown**: the distance or the runway's length is not known, so
//!   whether it fits is not either, never read as fitting (14 CFR
//!   91.103(b)). A known caution says more than "not known", so it comes
//!   first, as lib/findings' worstOf and the Go / No-Go's runways item
//!   order them.

use super::performance::{end_fit, FieldReport, FitWind};
use super::pick::End;
use crate::gonogo::calls::{runway, table, In};
use crate::json::{self, Value};

/// What one end's or one field's runway check found, as flags.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FitFacts {
    pub short: bool,
    pub crosswind_over: bool,
    /// Whole knots behind the end, 0 for none.
    pub tailwind_kt: f64,
    pub close: bool,
    pub beyond: bool,
    pub unknown: bool,
}

/// The finding ("stop", "caution", "unknown" or "ok") and its reason
/// ("short", "crosswind", "tailwind", "close", "beyond"; None for unknown
/// and ok), worst first as the module says.
pub fn fit_level(f: &FitFacts) -> (&'static str, Option<&'static str>) {
    if f.short {
        ("stop", Some("short"))
    } else if f.crosswind_over {
        ("caution", Some("crosswind"))
    } else if f.tailwind_kt > 0.0 {
        ("caution", Some("tailwind"))
    } else if f.close {
        ("caution", Some("close"))
    } else if f.beyond {
        ("caution", Some("beyond"))
    } else if f.unknown {
        ("unknown", None)
    } else {
        ("ok", None)
    }
}

/// `,"finding":…,"fit":…` for an answer's object.
pub fn fit_json(out: &mut String, f: &FitFacts) {
    let (finding, fit) = fit_level(f);
    out.push_str(",\"finding\":");
    json::string(out, finding);
    out.push_str(",\"fit\":");
    json::opt_string(out, fit);
}

/// `{"aircraft"?: {"takeoff"?, "landing"?, "crosswind"?: {"demonstrated_kt"?}},
/// "runway", "end": {"heading_true_deg"?}, "wind"?: {"dir_true_deg"?,
/// "speed_kt"?, "gust_kt"?}, "elevation_ft"? (null: not known, no distance), "altimeter_in_hg"?, "temp_c"?,
/// "weight_lb"?, "kind": "takeoff"|"landing"}`. A landing's end is the
/// "end" given, its `displaced_threshold_ft` and `lda_ft` its own or, where
/// it names its `ident`, the runway's end of that ident's.
pub(crate) fn end_fit_rule(i: In, v: &Value) -> Result<String, String> {
    let aircraft = i.obj(v, "aircraft")?;
    let takeoff = i.str(v, "kind")? == "takeoff";
    let t = match aircraft.map(|a| i.obj(a, if takeoff { "takeoff" } else { "landing" })).transpose()?.flatten() {
        Some(t) => Some(table(i, t)?),
        None => None,
    };
    let demonstrated = match aircraft.map(|a| i.obj(a, "crosswind")).transpose()?.flatten() {
        Some(c) => i.opt_num(c, "demonstrated_kt")?,
        None => None,
    };
    let r = runway(i, i.obj(v, "runway")?.map_or_else(|| i.err("runway", "is missing"), Ok)?)?;
    let end = i.obj(v, "end")?;
    let heading = match end {
        Some(e) => i.opt_num(e, "heading_true_deg")?,
        None => None,
    };
    let landing_end = match end.filter(|_| !takeoff) {
        None => None,
        Some(e) => {
            let named = i.opt_str(e, "ident")?.and_then(|id| r.ends.iter().find(|x| x.ident == id).cloned()).unwrap_or_default();
            Some(End {
                displaced_threshold_ft: i.opt_num(e, "displaced_threshold_ft")?.or(named.displaced_threshold_ft),
                lda_ft: i.opt_num(e, "lda_ft")?.or(named.lda_ft),
                ..named
            })
        }
    };
    let wind = match i.obj(v, "wind")? {
        Some(w) => Some(FitWind {
            dir_true_deg: i.opt_num(w, "dir_true_deg")?,
            speed_kt: i.opt_num(w, "speed_kt")?,
            gust_kt: i.opt_num(w, "gust_kt")?,
        }),
        None => None,
    };
    let field = FieldReport {
        elevation_ft: i.opt_num(v, "elevation_ft")?,
        altimeter_in_hg: i.opt_num(v, "altimeter_in_hg")?,
        temp_c: i.opt_num(v, "temp_c")?,
    };
    let f = end_fit(t.as_ref(), demonstrated, &r, heading, wind.as_ref(), &field, i.opt_num(v, "weight_lb")?, landing_end.as_ref());
    let mut out = String::from("{\"crosswind_kt\":");
    json::number(&mut out, f.crosswind_kt);
    out.push_str(&format!(",\"crosswind_over\":{},\"needed_ft\":", f.crosswind_over));
    json::opt_number(&mut out, f.needed_ft);
    out.push_str(",\"length_ft\":");
    json::opt_number(&mut out, f.length_ft);
    out.push_str(&format!(",\"short\":{},\"close\":{},\"unknown\":{},\"beyond\":{}", f.short, f.close, f.unknown, f.beyond));
    out.push_str(",\"tailwind_kt\":");
    json::number(&mut out, f.tailwind_kt);
    let facts = FitFacts {
        short: f.short,
        crosswind_over: f.crosswind_over,
        tailwind_kt: f.tailwind_kt,
        close: f.close,
        beyond: f.beyond,
        unknown: f.unknown,
    };
    fit_json(&mut out, &facts);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worst_first() {
        let all = FitFacts { short: true, crosswind_over: true, tailwind_kt: 3.0, close: true, beyond: true, unknown: true };
        assert_eq!(fit_level(&all), ("stop", Some("short")));
        assert_eq!(fit_level(&FitFacts { short: false, ..all }), ("caution", Some("crosswind")));
        assert_eq!(fit_level(&FitFacts { short: false, crosswind_over: false, ..all }), ("caution", Some("tailwind")));
        let calm = FitFacts { tailwind_kt: 0.0, ..FitFacts::default() };
        assert_eq!(fit_level(&FitFacts { close: true, beyond: true, ..calm }), ("caution", Some("close")));
        assert_eq!(fit_level(&FitFacts { beyond: true, unknown: true, ..calm }), ("caution", Some("beyond")));
        assert_eq!(fit_level(&FitFacts { unknown: true, ..calm }), ("unknown", None));
        assert_eq!(fit_level(&calm), ("ok", None));
    }
}
