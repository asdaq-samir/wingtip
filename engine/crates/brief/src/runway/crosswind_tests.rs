//! A crosswind is judged unrounded against a limit and rounded for the
//! page only (the aviation audit's AV-10): wind from 030° true at 21 kt on
//! a runway heading 360° true is 21 × sin 30° = 10.5 kt across, which
//! rounds (halves to even) to 10 and is still past a POH's 10 kt maximum
//! demonstrated crosswind (POH section 4).

use super::performance::{end_fit, FieldReport, FitWind};
use super::pick::Runway;
use super::wind::{crosswind_shown, favoured_end, Reported};
use crate::gonogo::minimums::{best_crosswind, RunwayWind};

#[test]
fn the_favoured_end_carries_the_crosswind_unrounded_beside_the_rounded() {
    let report = Reported { dir_true_deg: Some(30.0), speed_kt: Some(21.0), gust_kt: None };
    let f = favoured_end(&[(Some("36".into()), Some(360.0))], Some(&report), 0.0, None).unwrap();
    assert_eq!(f.crosswind_kt, 10.0);
    assert!((f.crosswind_exact_kt - 10.5).abs() < 1e-9);
}

#[test]
fn a_crosswind_rounded_down_to_the_demonstrated_is_still_past_it() {
    // 20.8 kt at 30° is 10.4 kt across: it rounds to 10.
    let wind = FitWind { dir_true_deg: Some(30.0), speed_kt: Some(20.8), gust_kt: None };
    let field = FieldReport { elevation_ft: None, altimeter_in_hg: None, temp_c: None };
    let fit = end_fit(None, Some(10.0), &Runway::default(), Some(360.0), Some(&wind), &field, None);
    assert!(fit.crosswind_over);
    assert_eq!(fit.crosswind_kt, 10.4);
    // Within the demonstrated, it is the whole knots.
    let fit = end_fit(None, Some(11.0), &Runway::default(), Some(360.0), Some(&wind), &field, None);
    assert!(!fit.crosswind_over);
    assert_eq!(fit.crosswind_kt, 10.0);
}

#[test]
fn the_minimums_judge_the_unrounded_crosswind_where_the_wind_carries_it() {
    let w = RunwayWind { end: "36".into(), crosswind_kt: 10.0, crosswind_exact_kt: Some(10.5), ..RunwayWind::default() };
    assert_eq!(best_crosswind(&[(false, Some(w.clone()))], None), Some((Some("36".into()), 10.5)));
    // Without it, the rounded one, as before.
    let rounded = RunwayWind { crosswind_exact_kt: None, ..w };
    assert_eq!(best_crosswind(&[(false, Some(rounded))], None), Some((Some("36".into()), 10.0)));
    assert_eq!(crosswind_shown(10.5, 10.0, Some(10.0)), 10.5);
    assert_eq!(crosswind_shown(9.6, 10.0, Some(10.0)), 10.0);
}
