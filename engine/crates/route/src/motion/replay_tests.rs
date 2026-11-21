use super::*;

fn at(t: f64, alt: Option<f64>) -> Report {
    Report { t, lat: 45.0 + t * 0.0005, lon: -93.0, alt_ft: alt, gs_kt: None, track_deg: None, ground: alt.is_none() }
}

#[test]
fn a_minute_unheard_is_a_gap_and_nothing_is_smoothed_across_it() {
    let mut reports: Vec<Report> = (0..5).map(|i| at(i as f64 * 10.0, Some(3000.0))).collect();
    reports.extend((0..5).map(|i| at(200.0 + i as f64 * 10.0, Some(5000.0))));
    let s = condition(reports, GAP_S);
    assert!(s[5].gap && !s[4].gap && !s[0].gap);
    assert_eq!(s[4].alt_ft, Some(3000.0));
    assert_eq!(s[5].alt_ft, Some(5000.0));
    // No climb read across the hole either.
    assert_eq!(s[5].vs_fpm, Some(0.0));
}

#[test]
fn a_steady_climb_reads_as_its_rate_through_the_25_ft_steps() {
    // 500 ft/min, reported every 5 s in 25 ft steps.
    let reports: Vec<Report> =
        (0..40).map(|i| at(i as f64 * 5.0, Some(((2000.0 + i as f64 * 5.0 * 500.0 / 60.0) / 25.0).round() * 25.0))).collect();
    let s = condition(reports, GAP_S);
    let vs = s[20].vs_fpm.unwrap();
    assert!((vs - 500.0).abs() < 40.0, "{vs}");
}

#[test]
fn level_reports_twenty_seconds_apart_read_level_not_unknown() {
    // readsb's cruise: a point every 20 s, wider than VS_SPAN_S each side.
    let reports: Vec<Report> = (0..6).map(|i| at(i as f64 * 20.0, Some(35000.0))).collect();
    let s = condition(reports, GAP_S);
    assert!(s.iter().all(|x| x.vs_fpm == Some(0.0)), "{:?}", s.iter().map(|x| x.vs_fpm).collect::<Vec<_>>());
}

#[test]
fn out_of_order_and_repeated_reports_are_put_in_order_once() {
    let s = condition(vec![at(20.0, Some(1000.0)), at(0.0, Some(1000.0)), at(20.0, Some(1000.0)), at(10.0, None)], GAP_S);
    assert_eq!(s.iter().map(|x| x.t).collect::<Vec<_>>(), vec![0.0, 10.0, 20.0]);
    assert!(s[1].ground && s[1].alt_ft.is_none());
}

#[test]
fn a_climb_from_a_runs_start_is_not_lifted_toward_where_it_is_going() {
    // 3,000 ft/min from 125 ft, a report a second, in 25 ft steps.
    let reports: Vec<Report> = (0..30).map(|i| at(i as f64, Some(((125.0 + i as f64 * 50.0) / 25.0).round() * 25.0))).collect();
    let s = condition(reports, GAP_S);
    let first = s[0].alt_ft.unwrap();
    assert!((first - 125.0).abs() < 15.0, "{first}");
}

#[test]
fn uneven_reports_keep_their_own_place_on_a_steady_line() {
    // Due north at a steady 0.0005 degrees a second, reported at 0,
    // 0.4, 1.6 and 3 s: each keeps the latitude of its own time.
    let s = condition(vec![at(0.0, Some(1000.0)), at(0.4, Some(1000.0)), at(1.6, Some(1000.0)), at(3.0, Some(1000.0))], GAP_S);
    for x in &s {
        assert!((x.lat - (45.0 + x.t * 0.0005)).abs() < 1e-9, "{} {}", x.t, x.lat);
    }
}

#[test]
fn ground_speed_and_track_are_worked_out_where_not_sent() {
    let s = condition(vec![at(0.0, Some(1000.0)), at(60.0, Some(1000.0)), at(120.0, Some(1000.0))], 100.0);
    // 0.03 degrees of latitude a minute is 1.8 nm, 108 kt, due north.
    let gs = s[1].gs_kt.unwrap();
    assert!((gs - 108.0).abs() < 1.0, "{gs}");
    assert!(s[1].track_deg.unwrap().abs() < 0.5);
    assert!((s[2].along_nm - 3.6).abs() < 0.05);
}
