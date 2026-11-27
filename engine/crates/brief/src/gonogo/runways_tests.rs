//! The check's wind along the end flown: a tailwind's gusts counted where
//! they are more behind the end, as FPL's runway list counts them
//! (runway_end_fit's tailwind_kt).

use super::*;
use crate::runway::wind::RunwayWind;

fn field(gust_kt: Option<f64>) -> Vec<Field> {
    let end = |ident: &str, heading: f64| End { ident: ident.into(), heading_true_deg: Some(heading), ..End::default() };
    // A wind from 080 at 10 on runway 5/23 (true 050 and 230): 23 has it
    // 150 degrees off its nose, 10 cos 150 = 8.66 behind, rounded 9.
    let wind = RunwayWind {
        end: "5".into(),
        headwind_kt: 9.0,
        crosswind_kt: 5.0,
        gust_crosswind_kt: None,
        in_use: false,
        crosswind_exact_kt: None,
    };
    let report = Report {
        altimeter_in_hg: Some(29.92),
        temp_c: Some(15.0),
        wind_dir_true_deg: Some(80.0),
        wind_speed_kt: Some(10.0),
        wind_gust_kt: gust_kt,
        wind_variable_deg: None,
    };
    let runway = Runway {
        surface: Some("ASPH".into()),
        length_ft: Some(9000.0),
        closed: false,
        ends: vec![end("5", 50.0), end("23", 230.0)],
        wind: Some(wind),
    };
    vec![Field { ident: "KAAA".into(), elevation_ft: Some(1000.0), metar: Some(report), runways: vec![runway] }]
}

fn airplane() -> Airplane {
    let table = ShortField {
        pressure_altitudes_ft: vec![0.0, 8000.0],
        temperatures_c: vec![0.0, 40.0],
        weights_lb: vec![2000.0, 2600.0],
        ground_roll_ft: vec![vec![vec![800.0; 2]; 2]; 2],
        total_50ft_ft: vec![vec![vec![1500.0; 2]; 2]; 2],
        grass_ground_roll_pct: 15.0,
        headwind_kt_per_10pct: Some(9.0),
        tailwind_kt_per_10pct: Some(2.0),
        tailwind_max_kt: Some(10.0),
    };
    Airplane { takeoff: Some(table.clone()), landing: Some(table), demonstrated_kt: Some(15.0) }
}

fn on_23(gust_kt: Option<f64>) -> Check {
    // The departure's runway out is its pattern's pick (picked_end).
    let picks = Picks { pattern: vec![("KAAA".into(), "23".into())], takeoff: vec![] };
    runway_checks(&airplane(), true, &field(gust_kt), Some(2400.0), Some(2400.0), Some(&picks)).remove(0)
}

#[test]
fn a_tailwind_shows_its_gusts_where_they_are_more_behind_the_end() {
    // 10 gusting 19 from 080 on 23: 19 cos 150 = 16.45 behind in the gusts.
    let gusty = on_23(Some(19.0));
    assert_eq!((gusty.end.as_deref(), gusty.picked, gusty.headwind_kt), (Some("23"), true, -16.0));
    assert_eq!(on_23(None).headwind_kt, -9.0);
}

#[test]
fn a_headwind_stays_the_steady_one() {
    // The wind's own end, 5: 10 cos 30 into it, the gusts not added.
    let into = runway_checks(&airplane(), true, &field(Some(19.0)), Some(2400.0), Some(2400.0), None).remove(0);
    assert_eq!((into.end.as_deref(), into.headwind_kt), (Some("5"), 9.0));
}

#[test]
fn the_shown_figure_errs_toward_the_stronger_tailwind() {
    assert_eq!(along_shown_kt(-9.0, Some(-16.45)), -16.0);
    assert_eq!(along_shown_kt(-9.0, None), -9.0);
    assert_eq!(along_shown_kt(8.0, Some(15.0)), 8.0);
    assert_eq!(along_shown_kt(0.0, Some(4.0)), 0.0);
    assert_eq!(along_shown_kt(0.0, Some(-4.4)), -4.0);
}
