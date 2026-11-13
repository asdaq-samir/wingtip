//! The worst a TAF forecasts in a window (route.rs worst_in_window), and
//! whether it covers the window: its prevailing periods with no gap,
//! which 14 CFR 91.169(b)(2)(i)'s hour either side of the ETA asks of the
//! destination's forecast (taf_window's `covers`).

use crate::json::Value;
use crate::sort::StableSort;

/// The worst a TAF forecasts in a window: the lowest ceiling and
/// visibility, any ceiling of no height, and whether it covers the window.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Worst {
    pub ceiling_ft: Option<f64>,
    pub ceiling_unknown: bool,
    pub visibility_sm: Option<f64>,
    pub covers: bool,
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// Whether the TAF's prevailing periods (the first line and each FM
/// group, whose hours run on to the next FM or the TAF's end) cover every
/// moment of [start, end] without a gap; for start == end, whether one
/// holds that moment. A TAF that ends, or begins, inside the window says
/// nothing of the rest of it, so a figure read from it is not "for at
/// least 1 hour before and for 1 hour after the estimated time of
/// arrival" (14 CFR 91.169(b)(2)(i)); TEMPO and PROB groups only modify a
/// prevailing period and cover nothing by themselves (FAA-H-8083-28B
/// 27.4.2.10).
pub fn covers_window(fcsts: &[Value], start: f64, end: f64) -> bool {
    let mut spans: Vec<(f64, f64)> = fcsts
        .iter()
        .filter(|p| matches!(p.get("change").and_then(Value::as_str).map_or("", |c| c.get(..5).unwrap_or(c)), "" | "FM"))
        .filter_map(|p| Some((num(p, "timeFrom")?, num(p, "timeTo")?)))
        .collect();
    spans.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    let (mut reach, mut begun) = (start, false);
    for (from, to) in spans {
        if from <= reach && to > reach {
            reach = to;
            begun = true;
        }
    }
    begun && reach >= end
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    fn fcsts(text: &str) -> Vec<Value> {
        json::parse(text).unwrap().as_array().unwrap().to_vec()
    }

    #[test]
    fn a_taf_ending_inside_the_window_does_not_cover_it() {
        // 14 CFR 91.169(b)(2)(i): "For at least 1 hour before and for 1
        // hour after the estimated time of arrival". ETA 3,600: the window
        // is 0 to 7,200. A TAF to 5,400 (ETA + 30 min) gives its worst but
        // does not cover the hour after.
        let short = fcsts(r#"[{"timeFrom":-1000,"timeTo":5400,"change":"","ceiling_ft":4000,"visibility_sm":6}]"#);
        let w = super::super::route::worst_in_window(&short, 0.0, 7200.0).unwrap();
        assert_eq!((w.ceiling_ft, w.covers), (Some(4000.0), false));
        // An FM group carrying it on to the end covers it, and one ending
        // exactly at the window's end does too.
        let on = fcsts(
            r#"[{"timeFrom":-1000,"timeTo":5400,"change":"","ceiling_ft":4000,"visibility_sm":6},
                {"timeFrom":5400,"timeTo":7200,"change":"FM","ceiling_ft":3000,"visibility_sm":6}]"#,
        );
        assert!(super::super::route::worst_in_window(&on, 0.0, 7200.0).unwrap().covers);
        // One that begins inside the window, and a TEMPO filling the gap,
        // do not.
        let late = fcsts(r#"[{"timeFrom":600,"timeTo":90000,"change":"","ceiling_ft":4000,"visibility_sm":6}]"#);
        assert!(!super::super::route::worst_in_window(&late, 0.0, 7200.0).unwrap().covers);
        let tempo = fcsts(
            r#"[{"timeFrom":-1000,"timeTo":5400,"change":"","ceiling_ft":4000,"visibility_sm":6},
                {"timeFrom":5000,"timeTo":8000,"change":"TEMPO","ceiling_ft":3000,"visibility_sm":6}]"#,
        );
        assert!(!super::super::route::worst_in_window(&tempo, 0.0, 7200.0).unwrap().covers);
        // An alternate's window is the ETA alone (91.169(c)).
        assert!(covers_window(&short, 5399.0, 5399.0));
        assert!(!covers_window(&short, 5400.0, 5400.0));
    }
}
