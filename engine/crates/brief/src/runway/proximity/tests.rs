//! The advisor against a runway 9-27 laid east and west at 40° N, 100 ft
//! wide, at a field 1,000 ft high: each boundary from its source, both
//! sides.

use super::*;
use wingtip_core::units::FT_PER_NM;

const LAT: f64 = 40.0;
/// Runway 9's threshold at the west end, 27's at the east: 0.02° of
/// longitude apart, about 5,590 ft at 40° N.
const WEST: f64 = -90.01;
const EAST: f64 = -89.99;
const ELEVATION: f64 = 1000.0;

fn strip(width_ft: Option<f64>, closed: bool) -> Strip {
    let end = |ident: &str, lon| End { ident: ident.into(), lat: LAT, lon };
    Strip { ends: [end("09", WEST), end("27", EAST)], width_ft, closed }
}

fn field() -> Field {
    Field { elevation_ft: Some(ELEVATION), pattern_agl_ft: None }
}

/// A fix `south_ft` south of the runway's middle, `east_ft` east of it.
fn fix(east_ft: f64, south_ft: f64, track: Option<f64>, kt: f64, agl: f64) -> Fix {
    let lat = LAT - south_ft / FT_PER_NM / 60.0;
    let lon = (WEST + EAST) / 2.0 + east_ft / FT_PER_NM / (60.0 * LAT.to_radians().cos());
    Fix { lat, lon, age_s: 0.5, accuracy_m: 5.0, track_deg: track, groundspeed_kt: Some(kt), altitude_ft: Some(ELEVATION + agl) }
}

fn ask(f: Fix) -> Proximity {
    proximity(&f, &field(), &[strip(Some(100.0), false)], &[])
}

#[test]
fn the_holding_position_is_the_widest_standard_for_the_width() {
    // AC 150/5300-13B Appendix G: G-2/G-4's 200 ft under 100 ft wide,
    // 250 ft at 100 (G-5, G-7 to G-9), 280 ft at 150 (G-12) or unknown.
    assert_eq!(hold_offset_ft(Some(99.0), None), 200.0);
    assert_eq!(hold_offset_ft(Some(100.0), None), 250.0);
    assert_eq!(hold_offset_ft(Some(149.0), None), 250.0);
    assert_eq!(hold_offset_ft(Some(150.0), None), 280.0);
    assert_eq!(hold_offset_ft(None, None), 280.0);
    // Footnote 8's foot per 100 ft of elevation, on runways 100 ft wide on.
    assert_eq!(hold_offset_ft(Some(150.0), Some(5000.0)), 330.0);
    assert_eq!(hold_offset_ft(Some(75.0), Some(5000.0)), 200.0);
}

#[test]
fn the_fix_is_used_only_fresh_and_good_to_30_m() {
    // AC 120-76D 11.17.2.3's 3 s and 11.17.2.4's 30 m, at and past each.
    let at = |age_s, accuracy_m| ask(Fix { age_s, accuracy_m, ..fix(0.0, 0.0, Some(270.0), 20.0, 0.0) }).state;
    assert_eq!(at(3.0, 30.0), State::OnRunway);
    assert_eq!(at(3.01, 30.0), State::NoFix);
    assert_eq!(at(0.0, 30.01), State::NoFix);
    assert_eq!(at(0.0, -1.0), State::NoFix);
}

#[test]
fn on_the_runway_names_the_end_rolled_along() {
    let west = ask(fix(0.0, 40.0, Some(268.0), 45.0, 0.0));
    assert_eq!((west.state, west.runway, west.end), (State::OnRunway, Some(0), Some(1)));
    let east = ask(fix(-1000.0, -40.0, Some(092.0), 45.0, 0.0));
    assert_eq!(east.end, Some(0));
    // Stopped: the runway, no end.
    assert_eq!(ask(fix(0.0, 0.0, Some(90.0), 0.0, 0.0)).end, None);
    // Just past its edge (50 ft each side) is not on it.
    assert_ne!(ask(fix(0.0, 55.0, Some(270.0), 10.0, 0.0)).state, State::OnRunway);
}

#[test]
fn approaching_the_holding_position_when_closing_within_the_lead() {
    // 400 ft south at 10 kt, the line at 260 ft (250 and footnote 8's 10
    // for the field's 1,000 ft): 140 ft to go, inside 10 s at 10 kt (169 ft).
    let p = ask(fix(0.0, 400.0, Some(0.0), 10.0, 0.0));
    assert_eq!(p.state, State::Approaching);
    assert!((p.hold_short_ft.unwrap() - 140.0).abs() < 2.0, "{:?}", p.hold_short_ft);
    // Facing north from the south, runway 9's threshold is on the left:
    // the sign reads 9-27 (AIM 2-3-8 b 1); from the north, 27-9.
    assert_eq!(runway_name(&strip(None, false), p.left_end), "9-27");
    let north = ask(fix(0.0, -400.0, Some(180.0), 10.0, 0.0));
    assert_eq!(runway_name(&strip(None, false), north.left_end), "27-9");
    // A taxiway meeting it at 59° still closes; one parallel does not.
    assert_eq!(ask(fix(0.0, 400.0, Some(59.0), 10.0, 0.0)).state, State::Approaching);
    assert_eq!(ask(fix(0.0, 400.0, Some(61.0), 10.0, 0.0)).state, State::Clear);
    assert_eq!(ask(fix(0.0, 300.0, Some(90.0), 10.0, 0.0)).state, State::Clear);
    // Going away, or stopped, is not approaching.
    assert_eq!(ask(fix(0.0, 400.0, Some(180.0), 10.0, 0.0)).state, State::Clear);
    assert_eq!(ask(fix(0.0, 400.0, Some(0.0), 0.0, 0.0)).state, State::Clear);
    // Past the lead: 600 ft south is 340 ft to go.
    assert_eq!(ask(fix(0.0, 600.0, Some(0.0), 10.0, 0.0)).state, State::Clear);
}

#[test]
fn inside_the_holding_position_says_none_left() {
    let p = ask(fix(0.0, 200.0, Some(0.0), 5.0, 0.0));
    assert_eq!((p.state, p.hold_short_ft), (State::Approaching, Some(0.0)));
}

#[test]
fn quiet_above_the_pattern() {
    // AC 90-66C's 1,000 ft above the field with none published.
    let final_at = |agl| ask(fix(-2800.0 - 1.5 * FT_PER_NM, 0.0, Some(90.0), 80.0, agl)).state;
    assert_eq!(final_at(1001.0), State::Above);
    assert_eq!(final_at(1000.0), State::LinedUp);
    // A published pattern height is the field's own.
    let low = Field { pattern_agl_ft: Some(800.0), ..field() };
    let f = fix(-2800.0 - 1.5 * FT_PER_NM, 0.0, Some(90.0), 80.0, 900.0);
    assert_eq!(proximity(&f, &low, &[strip(Some(100.0), false)], &[]).state, State::Above);
}

#[test]
fn lined_up_within_30_degrees_and_a_3_degree_path_of_the_pattern() {
    let threshold = -2795.0;
    let at = |east, south, track| ask(fix(threshold - east, south, Some(track), 80.0, 600.0));
    let p = at(2.0 * FT_PER_NM, 0.0, 90.0);
    assert_eq!((p.state, p.end), (State::LinedUp, Some(0)));
    assert!((p.threshold_ft.unwrap() - 2.0 * FT_PER_NM).abs() < 20.0);
    // AIM 5-4-20's 30°: 30 lined up, 31 not.
    assert_eq!(at(1.0 * FT_PER_NM, 0.0, 120.0).state, State::LinedUp);
    assert_eq!(at(1.0 * FT_PER_NM, 0.0, 121.0).state, State::Clear);
    // A 3° path at 1,000 ft is 3.14 nm out (AIM 2-1-2 a).
    assert_eq!(at(3.1 * FT_PER_NM, 0.0, 90.0).state, State::LinedUp);
    assert_eq!(at(3.2 * FT_PER_NM, 0.0, 90.0).state, State::Clear);
    // A downwind abeam and a base leg are never lined up.
    assert_eq!(ask(fix(0.0, 0.7 * FT_PER_NM, Some(270.0), 80.0, 1000.0)).state, State::Clear);
    assert_eq!(at(0.8 * FT_PER_NM, 0.4 * FT_PER_NM, 0.0).state, State::Clear);
    // Outside the 30° wedge seen from the threshold.
    assert_eq!(at(1.0 * FT_PER_NM, 0.6 * FT_PER_NM, 90.0).state, State::Clear);
    // Rolling out to the east end: runway 27's.
    let east = ask(fix(-threshold + 1.0 * FT_PER_NM, 0.0, Some(270.0), 80.0, 500.0));
    assert_eq!((east.state, east.end), (State::LinedUp, Some(1)));
}

#[test]
fn a_hot_spot_is_named_within_500_ft_on_the_surface() {
    let spot = |east_ft: f64| HotSpot {
        name: "HS 1".into(),
        lat: LAT - 400.0 / FT_PER_NM / 60.0,
        lon: (WEST + EAST) / 2.0 + east_ft / FT_PER_NM / (60.0 * LAT.to_radians().cos()),
    };
    let f = fix(0.0, 400.0, Some(0.0), 10.0, 0.0);
    let near = proximity(&f, &field(), &[strip(Some(100.0), false)], &[spot(499.0), spot(100.0)]);
    assert_eq!(near.hot_spot.map(|h| h.0), Some(1));
    let far = proximity(&f, &field(), &[strip(Some(100.0), false)], &[spot(501.0)]);
    assert_eq!(far.hot_spot, None);
}

#[test]
fn short_final_below_100_ft_is_lined_up_not_a_hold_short() {
    // 50 ft up, 1,000 ft short of runway 9's threshold at 65 kt: the
    // runway's end is near and closing, but it is a landing.
    let threshold = -2795.0;
    let p = ask(fix(threshold - 1000.0, 0.0, Some(90.0), 65.0, 50.0));
    assert_eq!((p.state, p.end), (State::LinedUp, Some(0)));
    // At a taxi's 15 kt toward the same end on the ground, the hold short.
    assert_eq!(ask(fix(threshold - 400.0, 0.0, Some(90.0), 15.0, 0.0)).state, State::Approaching);
    // 40 kt is the line: at it, still a taxi.
    assert_eq!(ask(fix(threshold - 400.0, 0.0, Some(90.0), 40.0, 0.0)).state, State::Approaching);
    assert_eq!(ask(fix(threshold - 400.0, 0.0, Some(90.0), 41.0, 0.0)).state, State::LinedUp);
}
