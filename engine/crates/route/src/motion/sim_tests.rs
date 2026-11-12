use super::*;

/// A point flying north at 120 kt from 45N 93W, `t` s in.
fn north(t: f64, alt: Option<f64>) -> Point {
    let nm = 120.0 / 3600.0 * t;
    Point {
        t,
        lat: 45.0 + nm * DEG_PER_NM,
        lon: -93.0,
        alt_ft: alt,
        gs_kt: Some(120.0),
        track_deg: Some(0.0),
        vs_fpm: Some(0.0),
        along_nm: nm,
        gap: false,
        ground: false,
    }
}

const ALL: (f64, f64) = (f64::NEG_INFINITY, f64::INFINITY);

#[test]
fn a_gap_splits_the_flight_and_nothing_is_drawn_across_it() {
    let mut points: Vec<Point> = (0..6).map(|i| north(i as f64 * 10.0, Some(3000.0))).collect();
    points.extend((0..6).map(|i| north(200.0 + i as f64 * 10.0, Some(3000.0))));
    points[6].gap = true;
    let segs = sim_flight(&points, &[], &[], true, ALL, 10.0);
    assert_eq!(segs.len(), 2);
    assert_eq!(segs[0].rows.last().unwrap().t, 50.0);
    assert_eq!(segs[1].rows[0].t, 200.0);
    // Ten a second, both ends included.
    assert_eq!(segs[0].rows.len(), 501);
    assert!((segs[0].rows[1].t - 0.1).abs() < 1e-9);
    // Only the run the window meets.
    assert_eq!(sim_flight(&points, &[], &[], true, (210.0, 220.0), 10.0).len(), 1);
}

#[test]
fn the_path_passes_every_report_and_flies_straight_between_straight_ones() {
    let points: Vec<Point> = (0..4).map(|i| north(i as f64 * 20.0, Some(3000.0))).collect();
    let seg = &sim_flight(&points, &[], &[], true, ALL, 10.0)[0];
    for p in &points {
        let r = seg.rows.iter().find(|r| (r.t - p.t).abs() < 1e-6).unwrap();
        assert!((r.lat - p.lat).abs() < 1e-9 && (r.lon - p.lon).abs() < 1e-9);
    }
    let mid = &seg.rows[100];
    assert!((mid.gs_kt - 120.0).abs() < 0.5, "{}", mid.gs_kt);
    assert!(mid.track_deg.abs() < 0.01 || (mid.track_deg - 360.0).abs() < 0.01);
    assert!(mid.bank_deg.abs() < 0.01 && mid.pitch_deg.abs() < 0.01);
}

/// A standard-rate turn to the right (3 degrees a second) at 120 kt,
/// reported every 5 s with its velocity, after a minute flying north.
fn standard_rate_turn() -> Vec<Point> {
    let v_nm_s = 120.0 / 3600.0;
    let radius_nm = v_nm_s / 3f64.to_radians();
    let mut points: Vec<Point> = (0..12).map(|i| north(i as f64 * 5.0, Some(3000.0))).collect();
    let start = points.last().unwrap().clone();
    // The centre is east of the airplane as it turns right.
    let (clat, clon) = (start.lat, start.lon + radius_nm * DEG_PER_NM / start.lat.to_radians().cos());
    for k in 1..=24 {
        let t = 55.0 + k as f64 * 5.0;
        let heading = 3.0 * (t - 55.0);
        let a = (heading - 90.0).to_radians();
        points.push(Point {
            t,
            lat: clat + radius_nm * a.cos() * DEG_PER_NM,
            lon: clon + radius_nm * a.sin() * DEG_PER_NM / clat.to_radians().cos(),
            alt_ft: Some(3000.0),
            gs_kt: Some(120.0),
            track_deg: Some(heading),
            vs_fpm: Some(0.0),
            along_nm: start.along_nm + v_nm_s * (t - 55.0),
            gap: false,
            ground: false,
        });
    }
    points
}

#[test]
fn a_standard_rate_turn_banks_as_the_instrument_flying_handbook_says() {
    let seg = &sim_flight(&standard_rate_turn(), &[], &[], true, ALL, 10.0)[0];
    // Mid-turn, 90 s in: "A rule of thumb to determine the approximate
    // angle of bank is to use 15 percent of the true airspeed"
    // (FAA-H-8083-15B ch. 7): 18 degrees at 120 kt, to the right.
    let mid = seg.rows.iter().find(|r| (r.t - 115.0).abs() < 1e-6).unwrap();
    assert!((mid.bank_deg - 18.0).abs() < 1.5, "{}", mid.bank_deg);
    assert!((mid.gs_kt - 120.0).abs() < 2.0, "{}", mid.gs_kt);
    // The roll-in starts before the heading moves (the lead).
    let before = seg.rows.iter().find(|r| (r.t - 54.0).abs() < 1e-6).unwrap();
    assert!(before.bank_deg > 1.0, "{}", before.bank_deg);
    // And no frame-to-frame jerk: a tenth of a second never rolls more
    // than a degree.
    assert!(seg.rows.windows(2).all(|w| (w[1].bank_deg - w[0].bank_deg).abs() < 1.0));
}

#[test]
fn a_climb_pitches_up_by_its_flight_path_angle() {
    let points: Vec<Point> =
        (0..6).map(|i| Point { vs_fpm: Some(1000.0), ..north(i as f64 * 10.0, Some(3000.0 + i as f64 * 10.0 * 1000.0 / 60.0)) }).collect();
    let seg = &sim_flight(&points, &[], &[], true, ALL, 10.0)[0];
    // atan(1,000 ft/min over 120 kt, 12,154 ft/min) = 4.70 degrees.
    let mid = &seg.rows[250];
    assert!((mid.pitch_deg - 4.70).abs() < 0.1, "{}", mid.pitch_deg);
    assert!((mid.vs_fpm - 1000.0).abs() < 5.0, "{}", mid.vs_fpm);
}

#[test]
fn pressure_altitude_is_set_on_the_airplanes_own_altimeter_setting() {
    let points: Vec<Point> = (0..4).map(|i| north(i as f64 * 10.0, Some(3000.0))).collect();
    // 30.10 inHg (1,019.3 hPa): the altimeter reads 165 ft above pressure
    // altitude (FAA-H-8083-25C ch. 11, Figure 11-3: 30.1, -165).
    let setting = Setting { t: 10.0, hpa: 30.10 * HPA_PER_INHG, alt_ft: Some(3000.0) };
    let seg = &sim_flight(&points, &[setting], &[], true, ALL, 1.0)[0];
    assert!(seg.msl);
    assert!((seg.rows[0].alt_ft - 3165.0).abs() < 3.0, "{}", seg.rows[0].alt_ft);
    // A setting sent at or above 18,000 ft is 29.92 (14 CFR 91.121(a)(2)),
    // not the local one: left as pressure altitude, and said so.
    let high = Setting { alt_ft: Some(35_000.0), ..setting };
    let seg = &sim_flight(&points, &[high], &[], true, ALL, 1.0)[0];
    assert!(!seg.msl && seg.rows[0].alt_ft == 3000.0);
    // A height already above sea level is never shifted.
    let seg = &sim_flight(&points, &[setting], &[], false, ALL, 1.0)[0];
    assert!(seg.msl && seg.rows[0].alt_ft == 3000.0);
}

#[test]
fn on_the_ground_it_stands_on_the_ground_level() {
    let mut points: Vec<Point> = (0..4).map(|i| north(i as f64 * 10.0, None)).collect();
    for p in &mut points {
        p.ground = true;
        p.gs_kt = Some(20.0);
    }
    let ground = [(0.0, 600.0), (10.0, 620.0)];
    let seg = &sim_flight(&points, &[], &ground, true, ALL, 1.0)[0];
    let r = &seg.rows[0];
    assert!(r.ground && (r.alt_ft - 600.0).abs() < 0.5 && r.agl_ft.unwrap().abs() < 0.5);
    assert!(r.bank_deg == 0.0 && r.pitch_deg == 0.0 && r.config.gear_down && r.config.taxi);
}
