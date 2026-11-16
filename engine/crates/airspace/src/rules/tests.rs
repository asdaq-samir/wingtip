//! rules.rs's tests: the bands, 91.117's speeds, 91.155's minimums and
//! 91.215's equipment, each against its CFR text.

use super::*;

fn volume(class: char, floor_ft: f64, floor_ref: FloorRef, ceiling_ft: f64) -> Volume {
    Volume { class, name: format!("{class} test"), floor_ft, floor_ref, ceiling_ft }
}

#[test]
fn a_class_d_under_open_sky() {
    // A Class D to 3,300 ft over 800 ft ground, Class E at 700 ft round it.
    let bands = column(800.0, &[volume('D', 0.0, FloorRef::Sfc, 3300.0), volume('E', 700.0, FloorRef::Agl, 18000.0)], false);
    assert_eq!(bands[0].class, 'D');
    assert_eq!(bands.last().unwrap().class, 'A');
    assert_eq!((bands[0].floor_ft, bands[0].ceiling_ft), (800.0, 3300.0));
    assert_eq!(bands[0].speed_kt, Some(200));
    assert_eq!(bands.last().unwrap().ceiling_ft, TOP_FT);
}

#[test]
fn the_91_117_speed_limit_by_class_and_height() {
    // 91.117(b): 200 kt at or below 2,500 ft above the surface in a
    // Class C or D; (a): 250 kt below 10,000 ft MSL; (c): 200 kt under
    // a Class B. (Moved from services/planner/tests_wingtip/test_airspace_at.py, #482.)
    for (class, floor, agl, under_b, limit) in [
        ('D', 640.0, 0.0, false, Some(200)),
        ('C', 640.0, 2499.0, false, Some(200)),
        ('C', 3140.0, 2500.0, false, Some(250)),
        ('D', 3140.0, 2500.0, false, Some(250)),
        ('E', 640.0, 0.0, false, Some(250)),
        ('G', 640.0, 0.0, false, Some(250)),
        ('B', 3000.0, 2000.0, false, Some(250)),
        ('E', 640.0, 0.0, true, Some(200)),
        ('E', 10000.0, 9000.0, false, None),
        ('A', 18000.0, 17000.0, false, None),
    ] {
        assert_eq!(speed_kt(class, floor, under_b, agl), limit, "{class} {floor} {agl} {under_b}");
    }
}

#[test]
fn the_91_155_minimums_by_class() {
    for (class, floor, agl, day_vis, clear) in [
        ('B', 3000.0, 2000.0, 3.0, true),
        ('C', 0.0, 0.0, 3.0, false),
        ('D', 0.0, 0.0, 3.0, false),
        ('E', 5000.0, 4000.0, 3.0, false),
        ('E', 11000.0, 9000.0, 5.0, false),
        ('G', 1000.0, 500.0, 1.0, true),
    ] {
        let day = minimums(class, floor, agl).unwrap().day;
        assert_eq!((day.visibility_sm, day.below_ft.is_none()), (day_vis, clear), "{class} {floor}");
    }
    assert!(minimums('A', 18000.0, 17000.0).is_none());
}

#[test]
fn g_alone_splits_at_1200_agl() {
    let bands = column(0.0, &[], false);
    assert_eq!(bands[0].class, 'G');
    assert_eq!(bands[0].ceiling_ft, 1200.0);
    assert_eq!(bands[0].minimums.unwrap().day.visibility_sm, 1.0);
}

#[test]
fn class_e_from_14500_ft_stops_1500_ft_above_high_ground() {
    // 71.71(a)(2): over 13,500 ft ground the band from 14,500 to 15,000 ft
    // is under 1,500 ft above the surface, so G; E from 15,000 ft.
    let bands = column(13500.0, &[], false);
    let at = |ft: f64| bands.iter().find(|b| b.floor_ft <= ft && ft < b.ceiling_ft).unwrap().class;
    assert_eq!(at(14700.0), 'G');
    assert_eq!(at(15100.0), 'E');
    assert!(bands.iter().any(|b| b.floor_ft == 15000.0));
}

#[test]
fn the_91_215_general_arms_come_before_a_class_ds_own() {
    // (b)(5)(i): at 10,000 ft MSL and 3,000 ft above the surface a Class D
    // asks for the transponder as well as the radio.
    let high = equipment('D', 10000.0, 3000.0, false, false).unwrap();
    assert!(high.starts_with("A two-way radio, and a transponder") && high.contains("91.215(b)(5)"), "{high}");
    // (b)(4): above a Class B or C, within its lateral limits.
    assert!(equipment('D', 4000.0, 3000.0, false, true).unwrap().contains("91.215(b)(4)"));
    // (b)(2): in a veil, the words the fixtures hold.
    assert_eq!(
        equipment('D', 1000.0, 0.0, true, false),
        Some("A two-way radio, and a transponder with altitude reporting and ADS-B Out: inside a 30 nm Mode C veil (91.215(b)(2), 91.225(d)(2)).")
    );
    // None of them: the radio alone. And outside D, as before.
    assert_eq!(equipment('D', 1000.0, 0.0, false, false), Some("A two-way radio."));
    assert_eq!(equipment('E', 10000.0, 2400.0, false, false), None);
    assert_eq!(equipment('E', 10000.0, 2500.0, false, false), Some(TRANSPONDER));
}
