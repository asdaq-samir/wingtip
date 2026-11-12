//! occurrence.rs's own tests: the window, the tolerances and each source
//! that does not agree, with the figures worked by hand.

use super::*;

// 2026-11-08 is day 20,765 since 1970 (Python's date arithmetic);
// 14:25 CST (UTC-6) is 20:25Z.
const NOV8: i64 = 20_765;

fn report(minute: Option<f64>, place: Place) -> Report {
    Report { n_number: Some("N123AB".into()), day: NOV8, minute, offsets_min: vec![-360.0], lat: 36.74, lon: -88.64, place }
}

fn at(minute_z: f64, lat: f64, lon: f64) -> Fix {
    Fix { t: (NOV8 * DAY_S) as f64 + minute_z * 60.0, lat, lon }
}

#[test]
fn the_day_is_the_one_days_from_civil_gives() {
    assert_eq!(days_from_civil(2026, 11, 8), NOV8);
}

#[test]
fn a_known_time_opens_an_hour_before_and_closes_fifteen_minutes_after_in_utc() {
    let (a, b) = window(&report(Some(14.0 * 60.0 + 25.0), Place::Town));
    let base = (NOV8 * DAY_S) as f64;
    assert_eq!(a, base + (20.0 * 60.0 + 25.0 - 60.0) * 60.0);
    assert_eq!(b, base + (20.0 * 60.0 + 25.0 + 15.0) * 60.0);
}

#[test]
fn no_time_is_the_whole_local_day_and_no_zone_every_us_offset() {
    let mut r = report(None, Place::Town);
    let base = (NOV8 * DAY_S) as f64;
    assert_eq!(window(&r), (base + 360.0 * 60.0, base + (1440.0 + 360.0) * 60.0));
    r.offsets_min.clear();
    // Midnight at UTC+10 is 14:00Z the day before; midnight next at UTC-11 is 11:00Z the day after.
    assert_eq!(window(&r), (base - 600.0 * 60.0, base + (1440.0 + 660.0) * 60.0));
}

#[test]
fn three_sources_agreeing_is_confirmed_and_a_town_allows_twenty_nm() {
    let r = report(Some(14.0 * 60.0 + 25.0), Place::Town);
    // 0.3 degrees of latitude is 18 nm: inside a town's 20.
    let fixes = [at(20.0 * 60.0, 36.74 + 0.3, -88.64)];
    let found = identity(&r, Some(("N123AB", "A1B2C3")), Some(("a1b2c3", &fixes)));
    assert_eq!(found.verdict, "confirmed");
    // 0.4 degrees, 24 nm: outside it, and a point's 10.5 is tighter still.
    let far = [at(20.0 * 60.0, 36.74 + 0.4, -88.64)];
    assert_eq!(identity(&r, Some(("N123AB", "a1b2c3")), Some(("a1b2c3", &far))).verdict, "needs_human");
    let point = report(Some(14.0 * 60.0 + 25.0), Place::Point);
    assert_eq!(identity(&point, Some(("N123AB", "a1b2c3")), Some(("a1b2c3", &fixes))).verdict, "needs_human");
}

#[test]
fn a_report_outside_the_window_is_no_track_not_a_guess() {
    let r = report(Some(14.0 * 60.0 + 25.0), Place::Town);
    // 18:00Z is 2 h 25 min before 20:25Z: past the hour.
    let early = [at(18.0 * 60.0, 36.74, -88.64)];
    let found = identity(&r, Some(("N123AB", "a1b2c3")), Some(("a1b2c3", &early)));
    assert_eq!(found.verdict, "no_track");
    assert!(found.nearest.is_none());
    assert_eq!(identity(&r, Some(("N123AB", "a1b2c3")), None).verdict, "no_track");
}

#[test]
fn a_different_address_a_pseudo_address_or_no_registry_needs_a_human() {
    let r = report(None, Place::Town);
    let fixes = [at(20.0 * 60.0, 36.74, -88.64)];
    assert_eq!(identity(&r, Some(("N123AB", "a1b2c3")), Some(("a1b2c4", &fixes))).verdict, "needs_human");
    assert_eq!(identity(&r, Some(("N123AB", "a1b2c3")), Some(("~a1b2c3", &fixes))).verdict, "needs_human");
    assert_eq!(identity(&r, None, Some(("a1b2c3", &fixes))).verdict, "needs_human");
    assert_eq!(identity(&r, Some(("N123AB", "")), Some(("a1b2c3", &fixes))).verdict, "needs_human");
    assert_eq!(identity(&r, Some(("N999ZZ", "a1b2c3")), Some(("a1b2c3", &fixes))).verdict, "needs_human");
    let mut nameless = r.clone();
    nameless.n_number = None;
    assert_eq!(identity(&nameless, Some(("N123AB", "a1b2c3")), Some(("a1b2c3", &fixes))).verdict, "needs_human");
}

#[test]
fn an_n_number_is_read_as_the_registry_writes_it() {
    assert_eq!(n_number("n-123ab"), "N123AB");
    assert_eq!(n_number("123AB"), "N123AB");
}

#[test]
fn the_call_reads_and_writes_json() {
    let v = json::parse(
        r#"{"report": {"n_number": "N123AB", "date": "2026-11-08", "time": "14:25", "utc_offsets_min": [-360],
            "lat": 36.74, "lon": -88.64, "place": "town"},
           "registry": {"n_number": "N123AB", "hex": "a1b2c3"},
           "track": {"hex": "a1b2c3", "points": [{"t": 1794168000, "lat": 36.75, "lon": -88.64}]}}"#,
    )
    .unwrap();
    let out = call("occurrence_identity", &v).unwrap();
    assert!(out.starts_with(r#"{"verdict":"confirmed","checks":[{"check":"registry","ok":true"#), "{out}");
    assert!(call("occurrence_identity", &json::parse(r#"{"report": {"date": "today"}}"#).unwrap()).is_err());
}
