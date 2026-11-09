//! Runway visual range against a visibility minimum: the comparable values
//! of 14 CFR 91.175(h)(2), the one table that ties RVR to ground
//! visibility for takeoff and landing under IFR.
//!
//! 91.175(h)(2), as published (eCFR, read 2026-11-09):
//!
//! | RVR (feet) | Visibility (statute miles) |
//! |---|---|
//! | 1,600 | 1/4 |
//! | 2,400 | 1/2 |
//! | 3,200 | 5/8 |
//! | 4,000 | 3/4 |
//! | 4,500 | 7/8 |
//! | 5,000 | 1 |
//! | 6,000 | 1 1/4 |
//!
//! The rule (`rvr_check`) takes a runway end's readings (touchdown,
//! midpoint, rollout, ft, as the RVR system reports them: STDDS's APDS, the
//! planner's wingtip.rvr) and a minimum, either an RVR (ft) or a
//! visibility (statute miles, the pilot's own or a plate's), and says
//! whether the runway is under it. Two simplifications, each toward the
//! safer answer:
//!
//! - The lowest of the readings reported is the one compared: a reading
//!   at one part of the runway under the minimum is not hidden by
//!   another's being above it.
//! - A visibility minimum between the table's rows is taken as the RVR of
//!   the next row up (3/8 SM asks 2,400 ft, as 1/2 does), and one past the
//!   table (more than 1 1/4 SM) has no RVR that shows it: the RVR system's
//!   most is 6,000 ft (AIM 7-1-13), so such a minimum is not judged here
//!   and the answer says so. A reading of the system's most ("6,000 or
//!   more") is under no minimum the table reaches.
//!
//! Nothing here says a flight may or may not go: the pilot's minimums and
//! the plate's are the pilot's, and the reading is what the tower's RVR
//! system says now.

use crate::json::{self, Value};

/// The table, as (RVR ft, visibility SM).
pub const COMPARABLE: [(f64, f64); 7] = [
    (1600.0, 0.25),
    (2400.0, 0.5),
    (3200.0, 0.625),
    (4000.0, 0.75),
    (4500.0, 0.875),
    (5000.0, 1.0),
    (6000.0, 1.25),
];
/// The most an RVR system reports, ft (AIM 7-1-13).
pub const MOST_FT: f64 = 6000.0;

/// The names this module answers.
pub const NAMES: [&str; 1] = ["rvr_check"];

/// The RVR the table pairs with a visibility minimum: the row's, or the
/// next row up's for one between rows; None past the table (more than
/// 1 1/4 SM), which no RVR reading shows.
pub fn rvr_for_visibility(sm: f64) -> Option<f64> {
    COMPARABLE.iter().find(|(_, vis)| *vis >= sm - 1e-9).map(|(rvr, _)| *rvr)
}

/// The visibility the table pairs with an RVR reading: the row's, or the
/// next row down's for one between rows; None under 1,600 ft.
pub fn visibility_for_rvr(ft: f64) -> Option<f64> {
    COMPARABLE.iter().rev().find(|(rvr, _)| *rvr <= ft + 1e-9).map(|(_, vis)| *vis)
}

/// A runway end's check: the reading compared, whether it is the system's
/// most, the minimum in feet, and whether the reading is under it (None
/// where there is no reading or no RVR for the minimum).
#[derive(Debug, PartialEq)]
pub struct Check {
    pub reading_ft: Option<f64>,
    pub at_most: bool,
    pub minimum_ft: Option<f64>,
    pub under: Option<bool>,
}

/// One runway end checked: the lowest reading reported against the
/// minimum (an RVR in ft, else a visibility in SM by the table).
pub fn check(readings: &[Option<f64>], minimum_rvr_ft: Option<f64>, minimum_sm: Option<f64>) -> Check {
    let reading = readings.iter().flatten().copied().fold(None, |low: Option<f64>, r| Some(low.map_or(r, |l| l.min(r))));
    let minimum = minimum_rvr_ft.or_else(|| minimum_sm.and_then(rvr_for_visibility));
    let at_most = reading.is_some_and(|r| r >= MOST_FT);
    let under = match (reading, minimum) {
        (Some(r), Some(m)) => Some(r < m),
        _ => None,
    };
    Check { reading_ft: reading, at_most, minimum_ft: minimum, under }
}

fn opt_num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// `rvr_check`: `{"runways": [{"runway", "touchdown_ft", "midpoint_ft",
/// "rollout_ft"}], "minimum_rvr_ft"?, "minimum_sm"?}` to `{"minimum_ft",
/// "judged", "runways": [{"runway", "reading_ft", "at_most", "under",
/// "comparable_sm"}]}`: `judged` false where the minimum has no RVR
/// (none given, or more than 1 1/4 SM), `comparable_sm` the visibility the
/// table pairs with the reading (91.175(h)(2)).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "rvr_check" {
        return Err(format!("{name}: not a rule of rvr"));
    }
    let runways = v.get("runways").and_then(Value::as_array).ok_or("rvr_check: \"runways\" is missing")?;
    let (min_rvr, min_sm) = (opt_num(v, "minimum_rvr_ft"), opt_num(v, "minimum_sm"));
    let minimum = min_rvr.or_else(|| min_sm.and_then(rvr_for_visibility));
    let mut out = String::from("{\"minimum_ft\":");
    json::opt_number(&mut out, minimum);
    out.push_str(",\"judged\":");
    out.push_str(if minimum.is_some() { "true" } else { "false" });
    out.push_str(",\"runways\":[");
    for (i, runway) in runways.iter().enumerate() {
        let readings = [opt_num(runway, "touchdown_ft"), opt_num(runway, "midpoint_ft"), opt_num(runway, "rollout_ft")];
        let c = check(&readings, min_rvr, min_sm);
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"runway\":");
        json::opt_string(&mut out, runway.get("runway").and_then(Value::as_str));
        out.push_str(",\"reading_ft\":");
        json::opt_number(&mut out, c.reading_ft);
        out.push_str(",\"at_most\":");
        out.push_str(if c.at_most { "true" } else { "false" });
        out.push_str(",\"under\":");
        out.push_str(match c.under {
            Some(true) => "true",
            Some(false) => "false",
            None => "null",
        });
        out.push_str(",\"comparable_sm\":");
        json::opt_number(&mut out, c.reading_ft.and_then(visibility_for_rvr));
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_row_of_the_table_pairs_both_ways() {
        // 91.175(h)(2), row by row.
        for (rvr, vis) in COMPARABLE {
            assert_eq!(rvr_for_visibility(vis), Some(rvr));
            assert_eq!(visibility_for_rvr(rvr), Some(vis));
        }
    }

    #[test]
    fn between_rows_asks_more_and_gives_less() {
        // 3/8 SM asks what 1/2 does; 2,000 ft shows only what 1,600 does.
        assert_eq!(rvr_for_visibility(0.375), Some(2400.0));
        assert_eq!(visibility_for_rvr(2000.0), Some(0.25));
        assert_eq!(visibility_for_rvr(1400.0), None);
        // Past the table, no RVR shows the minimum.
        assert_eq!(rvr_for_visibility(1.25), Some(6000.0));
        assert_eq!(rvr_for_visibility(1.5), None);
    }

    #[test]
    fn the_lowest_reading_is_compared_on_both_sides_of_the_minimum() {
        // A 1/2 SM minimum is 2,400 ft: 2,400 is not under it, 2,200 is.
        assert_eq!(check(&[Some(6000.0), Some(2400.0), None], None, Some(0.5)).under, Some(false));
        let low = check(&[Some(6000.0), Some(2200.0), Some(6000.0)], None, Some(0.5));
        assert_eq!((low.reading_ft, low.under), (Some(2200.0), Some(true)));
        // An RVR minimum is taken as given.
        assert_eq!(check(&[Some(1800.0)], Some(1800.0), None).under, Some(false));
        // No reading, or no RVR for the minimum: not judged.
        assert_eq!(check(&[None, None, None], None, Some(0.5)).under, None);
        assert_eq!(check(&[Some(6000.0)], None, Some(3.0)).under, None);
        assert!(check(&[Some(6000.0)], None, None).at_most);
    }

    #[test]
    fn the_rule_answers_by_name() {
        let v = json::parse(r#"{"runways":[{"runway":"13R","touchdown_ft":6000,"midpoint_ft":null,"rollout_ft":6000},{"runway":"31L","touchdown_ft":2000}],"minimum_sm":0.5}"#).unwrap();
        assert_eq!(
            call("rvr_check", &v).unwrap(),
            r#"{"minimum_ft":2400.0,"judged":true,"runways":[{"runway":"13R","reading_ft":6000.0,"at_most":true,"under":false,"comparable_sm":1.25},{"runway":"31L","reading_ft":2000.0,"at_most":false,"under":true,"comparable_sm":0.25}]}"#
        );
    }
}
