//! flow_sample.rs's own tests: the cell, the wind's parts, the calm, and
//! each field read between or as its worst, the figures worked by hand.

use super::*;

/// A 4 by 2 picture over 0 to 4 east, 0 to 2 north: pixel middles at
/// half degrees.
const BOUNDS: [f64; 4] = [0.0, 0.0, 4.0, 2.0];

#[test]
fn a_point_is_read_from_the_four_pixel_middles_round_it() {
    // 1.0 E, 1.25 N: half way between columns 0 and 1, a quarter of the
    // way from row 0 (1.5 N) to row 1 (0.5 N).
    assert_eq!(cell(BOUNDS, 4, 2, 1.25, 1.0), Some(Cell { pixels: [0, 1, 4, 5], fx: 0.5, fy: 0.25 }));
    // On a pixel's middle, all its own.
    assert_eq!(cell(BOUNDS, 4, 2, 1.5, 0.5), Some(Cell { pixels: [0, 1, 4, 5], fx: 0.0, fy: 0.0 }));
    // Within half a pixel of the edge, the edge's pixel.
    assert_eq!(cell(BOUNDS, 4, 2, 0.1, 3.9).map(|c| c.pixels), Some([7, 7, 7, 7]));
    assert_eq!(cell(BOUNDS, 4, 2, 2.1, 1.0), None);
}

#[test]
fn the_wind_is_the_average_of_its_parts_not_of_its_speeds() {
    // Unscaled -50 to 50 kt: byte 0 is -50, 255 is 50. A westerly of
    // 50 kt beside an easterly of 50 kt, read half way: calm, where an
    // average of the speeds reads 50.
    let (west, east) = ([255.0, 127.5, 255.0], [0.0, 127.5, 255.0]);
    let r = sample([west, east, west, east], 0.5, 0.0, [-50.0, 50.0], Field::Vector).unwrap();
    assert!(r.value.abs() < 1e-9 && r.from_deg.is_none() && r.calm);
    // A wind from the west, 50 kt: blowing east.
    let r = sample([west; 4], 0.3, 0.6, [-50.0, 50.0], Field::Vector).unwrap();
    assert!((r.value - 50.0).abs() < 1e-9 && (r.from_deg.unwrap() - 270.0).abs() < 1e-9 && !r.calm);
    // From the north: the north part negative.
    let r = sample([[127.5, 0.0, 255.0]; 4], 0.0, 0.0, [-50.0, 50.0], Field::Vector).unwrap();
    assert!(r.from_deg.unwrap().abs() < 1e-9);
}

#[test]
fn under_a_knot_is_calm_with_no_direction() {
    // The weather service's wind picture, -100 to 100 kt a part: byte
    // 128 is 0.39 kt, the nearest a calm's parts come to nothing.
    let r = sample([[128.0, 128.0, 255.0]; 4], 0.0, 0.0, [-100.0, 100.0], Field::Vector).unwrap();
    assert!(r.value > 0.5 && r.value < CALM_BELOW_KT && r.calm && r.from_deg.is_none(), "{r:?}");
    // A knot is not calm (FMH-1 Table 5-1: 1-3 kt, smoke drifts).
    let r = sample([[127.5, 127.5 - 255.0 / 200.0, 255.0]; 4], 0.0, 0.0, [-100.0, 100.0], Field::Vector).unwrap();
    assert!((r.value - 1.0).abs() < 1e-9 && !r.calm && r.from_deg.unwrap().abs() < 1e-9, "{r:?}");
}

#[test]
fn a_scalar_is_read_linearly_and_none_where_a_pixel_has_none() {
    let p = |red: f64, alpha: f64| [red, 0.0, alpha];
    let r = sample([p(0.0, 255.0), p(255.0, 255.0), p(0.0, 255.0), p(255.0, 255.0)], 0.25, 0.5, [0.0, 100.0], Field::Scalar).unwrap();
    assert!((r.value - 25.0).abs() < 1e-9 && r.from_deg.is_none());
    let none = p(0.0, 0.0);
    assert_eq!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.25, 0.5, [0.0, 100.0], Field::Scalar), None);
    // A pixel the point is not read from at all does not count.
    assert!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.0, 0.5, [0.0, 100.0], Field::Scalar).is_some());
}

#[test]
fn the_ceiling_is_none_at_its_pictures_top_and_rounded_to_its_step() {
    // app.flow_grid's ceiling: 0 to 12,750 ft, 50 ft a step.
    let top = [0.0, 12_750.0];
    let at = |red: f64, fx: f64| {
        sample([[red, 0.0, 255.0], [red + 1.0, 0.0, 255.0], [red, 0.0, 255.0], [red + 1.0, 0.0, 255.0]], fx, 0.0, top, Field::Ceiling)
            .unwrap()
    };
    // The top byte: a ceiling over 12,750 ft or none, either no ceiling.
    let r = sample([[255.0, 0.0, 255.0]; 4], 0.0, 0.0, top, Field::Ceiling).unwrap();
    assert!(r.no_ceiling && r.value == 12_750.0, "{r:?}");
    // The step under the top is a ceiling, and so is any point read
    // from it and the top: only the top everywhere is none.
    let r = at(254.0, 0.0);
    assert!(!r.no_ceiling && r.value == 12_700.0, "{r:?}");
    let r = at(254.0, 0.5);
    assert!(!r.no_ceiling && r.value == 12_700.0, "{r:?}");
    // AIM 7-1-7's MVFR bound, 3,000 ft (byte 60), reads as itself
    // wherever the point is between it and 3,050: the lower.
    assert_eq!(at(60.0, 0.25).value, 3_000.0);
    assert_eq!(at(60.0, 0.75).value, 3_000.0);
    // On 3,050's own middle, its own value: the pixel read is that one.
    assert_eq!(at(60.0, 1.0).value, 3_050.0);
    // A plain field is never a ceiling, nor rounded.
    assert!(!sample([[255.0, 0.0, 255.0]; 4], 0.0, 0.0, top, Field::Scalar).unwrap().no_ceiling);
}

#[test]
fn the_ceiling_is_the_lowest_round_the_point_never_a_height_between() {
    // app.flow_grid's ceiling, 0 to 12,750 ft: none (the top, byte 255)
    // beside a 500 ft ceiling (byte 10), AIM 7-1-7's IFR floor ("IFR.
    // Ceiling 500 to less than 1,000 feet"). Half way from one to the
    // other a straight-line reading says 6,625 ft, VFR; the data holds
    // 500, and that is the reading anywhere the low pixel is read from.
    let top = [0.0, 12_750.0];
    let (none, low) = ([255.0, 0.0, 255.0], [10.0, 0.0, 255.0]);
    for (fx, fy) in [(0.5, 0.0), (0.5, 0.5), (0.01, 0.0), (0.99, 0.99)] {
        let r = sample([none, low, none, none], fx, fy, top, Field::Ceiling).unwrap();
        assert!(r.value == 500.0 && !r.no_ceiling, "{fx} {fy}: {r:?}");
    }
    // On the clear pixel's own middle, the model's own value there: none.
    assert!(sample([none, low, none, none], 0.0, 0.0, top, Field::Ceiling).unwrap().no_ceiling);
    // A missing pixel the point is read from is still no reading.
    assert_eq!(sample([none, [10.0, 0.0, 0.0], none, none], 0.5, 0.5, top, Field::Ceiling), None);
}

#[test]
fn the_visibility_is_the_lowest_round_the_point() {
    // app.flow_grid's visibility, 0 to 10 SM: 10 SM (its "10 or more")
    // beside 0.8 SM (byte 20.4 is 0.8), under AIM 7-1-7's LIFR "1
    // mile". Read anywhere between, 0.8 SM, never the VFR 5.4 SM a
    // straight line gives half way from one to the other.
    let vis = [0.0, 10.0];
    let r =
        sample([[255.0, 0.0, 255.0], [20.4, 0.0, 255.0], [255.0, 0.0, 255.0], [255.0, 0.0, 255.0]], 0.5, 0.5, vis, Field::Least).unwrap();
    assert!((r.value - 0.8).abs() < 1e-9 && !r.no_ceiling && !r.calm, "{r:?}");
    assert_eq!(Field::named("vis"), Field::Least);
    assert_eq!(Field::named("ceiling"), Field::Ceiling);
    // The temperature, a continuous field, still reads between.
    assert_eq!(Field::named("temp"), Field::Scalar);
}

/// Four pixels, one of them `odd`, the rest `rest`, all with a value.
fn one_odd(rest: f64, odd: f64) -> [Pixel; 4] {
    [[rest, 0.0, 255.0], [odd, 0.0, 255.0], [rest, 0.0, 255.0], [rest, 0.0, 255.0]]
}

#[test]
fn the_freezing_level_is_the_lowest_round_the_point() {
    // app.flow_grid's freezing level, 0 to 25,500 ft MSL, 100 ft a step:
    // 8,000 ft (byte 80) beside 2,000 ft (byte 20). AIM 7-1-19 puts icing
    // in visible moisture at +02 to -10 C, so it begins round the lower;
    // half way a straight line reads 5,000, 3,000 ft above it.
    let r = sample(one_odd(80.0, 20.0), 0.5, 0.5, [0.0, 25_500.0], Field::Least).unwrap();
    assert_eq!(r.value, 2_000.0);
    assert_eq!(Field::named("frzlvl"), Field::Least);
    // On the higher pixel's own middle, its own value.
    assert_eq!(sample(one_odd(80.0, 20.0), 0.0, 0.0, [0.0, 25_500.0], Field::Least).unwrap().value, 8_000.0);
}

#[test]
fn a_hazard_is_the_highest_round_the_point_never_a_figure_between() {
    // Icing, 0 to 5.1, a 50th a step: none (0) beside heavy (4, byte 200)
    // reads heavy anywhere between, never the moderate (2) a straight line
    // makes half way, a category neither pixel holds (AIM 7-1-19).
    let r = sample(one_odd(0.0, 200.0), 0.5, 0.5, [0.0, 5.1], Field::Most).unwrap();
    assert!((r.value - 4.0).abs() < 1e-9, "{r:?}");
    // Precipitation, 0 to 75 dBZ: 0 beside 51 dBZ (byte 173.4), AIM
    // 7-1-12's "EXTREME" (> 50 dBZ), reads 51 at a quarter, where a line
    // gives 12.75, "LIGHT" (< 26 dBZ).
    let r = sample(one_odd(0.0, 173.4), 0.25, 0.0, [0.0, 75.0], Field::Most).unwrap();
    assert!((r.value - 51.0).abs() < 1e-9, "{r:?}");
    // Cloud tops, 0 to 51,000 ft MSL: 8,000 ft (byte 40) beside FL240
    // (byte 120) reads 24,000 ft, the top a pilot has to clear by 91.155's
    // 1,000 ft, never the 16,000 a line gives half way.
    assert_eq!(sample(one_odd(40.0, 120.0), 0.5, 0.0, [0.0, 51_000.0], Field::Most).unwrap().value, 24_000.0);
    // On the lower pixel's own middle, its own value: the higher is not read.
    assert_eq!(sample(one_odd(40.0, 120.0), 0.0, 0.0, [0.0, 51_000.0], Field::Most).unwrap().value, 8_000.0);
    // A missing pixel the point is read from is still no reading.
    assert_eq!(
        sample([[0.0, 0.0, 255.0], [200.0, 0.0, 0.0], [0.0, 0.0, 255.0], [0.0, 0.0, 255.0]], 0.5, 0.5, [0.0, 5.1], Field::Most),
        None
    );
    for name in ["gust", "precip", "cape", "cloud", "tops", "icing", "turb"] {
        assert_eq!(Field::named(name), Field::Most, "{name}");
    }
}

#[test]
fn the_rules_answer_their_contracts() {
    let c = json::parse(r#"{"bounds":[0,0,4,2],"width":4,"height":2,"lat":1.25,"lon":1}"#).unwrap();
    assert_eq!(call("flow_cell", &c).unwrap(), r#"{"pixels":[0,1,4,5],"fx":0.5,"fy":0.25}"#);
    let s = json::parse(r#"{"pixels":[[0,0,255],[255,0,255],[0,0,255],[255,0,255]],"fx":0.25,"fy":0.5,"unscale":[0,100],"vector":false}"#)
        .unwrap();
    assert_eq!(call("flow_sample", &s).unwrap(), r#"{"value":25.0,"from_deg":null,"calm":false,"no_ceiling":false}"#);
    // The field named by its picture: the visibility reads its lowest.
    let s = json::parse(
        r#"{"pixels":[[0,0,255],[255,0,255],[0,0,255],[255,0,255]],"fx":0.25,"fy":0.5,"unscale":[0,100],"vector":false,"field":"vis"}"#,
    )
    .unwrap();
    assert_eq!(call("flow_sample", &s).unwrap(), r#"{"value":0.0,"from_deg":null,"calm":false,"no_ceiling":false}"#);
    assert!(call("flow_sample", &json::parse(r#"{"pixels":[]}"#).unwrap()).is_err());
}
