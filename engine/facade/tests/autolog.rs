//! A logbook entry drawn from a flown track (wingtip_engine::autolog),
//! held to the shared fixture apps/web/src/lib/fixtures/logbookTrack.json
//! -- a C81 to KDLH flight on 9 November 2026 with a hold at CHERL, the
//! ILS RWY 27 to a touch-and-go after civil dusk (1.1's night) and before
//! 1 hour after sunset (61.57(b)'s), and the ILS again to a full stop in
//! 61.57(b)'s night -- and to tracks flown here: laps of a pattern, a
//! landing either side of 61.1(b)'s 50 nm, a low approach, a track that
//! ends in the air. Each expected figure is how the track was flown and
//! what the rule's own words make of it, not this code's output.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/logbookTrack.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn fixture_draft(utc_offset_min: f64) -> Value {
    let f = fixture();
    ask(
        "logbook_from_track",
        json!({ "points": f["points"], "fields": f["fields"], "drawings": f["drawings"], "picked": f["picked"],
                "aircraft": f["aircraft"], "aircraft_type": f["aircraft_type"], "utc_offset_min": utc_offset_min }),
    )
}

#[test]
fn the_c81_to_kdlh_flight_is_logged_as_flown() {
    let d = fixture_draft(-360.0);
    let e = &d["entry"];
    assert_eq!(e["flownOn"], "2026-11-09");
    assert_eq!(e["route"], "C81 KDLH");
    assert_eq!(e["aircraft"], "N3429J");
    // Moving off at C81 about 19:59Z, at rest at KDLH about 23:58Z.
    assert_eq!(e["totalHours"], 4.0);
    assert!(e["airHours"].as_f64().unwrap() < 4.0);
    // 1.1's night began at KDLH's civil dusk, a little after 23:00Z.
    let night = e["nightHours"].as_f64().unwrap();
    assert!((0.6..=1.0).contains(&night), "{night}");
    // 61.57(a) counts the touch-and-go, (b) only the full stop after
    // 1 hour after sunset.
    assert_eq!(e["dayLandings"], 1.0);
    assert_eq!(e["nightLandings"], 1.0);
    assert_eq!(e["toweredLandings"], 1.0);
    assert_eq!(e["touchAndGoes"], 1.0);
    let kinds: Vec<&str> = d["landings"].as_array().unwrap().iter().map(|l| l["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["touch_and_go", "full_stop"]);
    let (tg, stop) = (&d["landings"][0], &d["landings"][1]);
    assert_eq!((tg["night"].as_bool(), tg["passenger_night"].as_bool(), tg["counts_night"].as_bool()), (Some(true), Some(false), Some(false)));
    assert_eq!((stop["night"].as_bool(), stop["passenger_night"].as_bool(), stop["counts_night"].as_bool()), (Some(true), Some(true), Some(true)));
    assert_eq!(d["takeoffs"][0]["field"], "C81");
    assert_eq!(d["takeoffs"][0]["night"], false);
    // 323 nm in a straight line: cross-country under 61.1(b)(ii).
    assert_eq!(d["cross_country"]["over_50_nm"], true);
    assert_eq!(e["crossCountryHours"], e["totalHours"]);
    assert_eq!(e["longestLegNm"], 323.0);
    // Two ILS RWY 27s (the one picked of the finals the track fits) and
    // the hold at CHERL, offered apart: not in the entry until the pilot
    // says they were flown by instruments (61.51(g)(1)).
    let names: Vec<&str> = d["approaches"].as_array().unwrap().iter().map(|a| a["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["ILS RWY 27", "ILS RWY 27"]);
    assert_eq!(d["approaches"][0]["outcome"], "missed");
    assert_eq!(d["approaches"][1]["outcome"], "landed");
    assert_eq!(d["holds"][0]["fix"], "CHERL");
    assert_eq!(d["holds"][0]["racetracks"], 2.0);
    assert_eq!(d["instrument"], json!({ "approaches": 2.0, "holding": true, "tracking": true }));
    assert_eq!((e["approaches"].as_f64(), e["holding"].as_bool()), (Some(0.0), Some(false)));
    assert!(e["remarks"].as_str().unwrap().contains("ILS RWY 27 KDLH x2"));
    // Every figure says why, with its source.
    for item in ["totalHours", "nightHours", "landing", "crossCountryHours", "approaches", "holding", "flownOn"] {
        assert!(d["reasons"].as_array().unwrap().iter().any(|r| r["item"] == item && r["source"].as_str().is_some_and(|s| !s.is_empty())), "{item}");
    }
}

#[test]
fn the_date_is_the_pilots_own() {
    // 19:59Z is 05:59 the next morning ten hours east of UTC.
    assert_eq!(fixture_draft(600.0)["entry"]["flownOn"], "2026-11-10");
}

#[test]
fn the_places_to_look_for_fields_are_where_it_took_off_landed_and_came_low() {
    let f = fixture();
    let places = ask("logbook_track_places", json!({ "points": f["points"] }));
    let near = |lat: f64, lon: f64, kind: &str| {
        places["places"].as_array().unwrap().iter().any(|p| {
            p["kind"] == kind && (p["lat"].as_f64().unwrap() - lat).abs() < 0.05 && (p["lon"].as_f64().unwrap() - lon).abs() < 0.05
        })
    };
    assert!(near(42.3246, -88.0741, "takeoff"), "C81");
    assert!(near(46.8419, -92.1987, "landing"), "KDLH");
    assert!(near(46.8419, -92.1987, "low"), "the touch-and-go at KDLH");
    assert_eq!(places["within_nm"], 2.5);
}

// --- Tracks flown here -------------------------------------------------------

/// 15 June 2026, 15:00Z: mid-morning in Wisconsin, day throughout.
const DAY_MS: f64 = 1_781_535_600_000.0;
const HOME: (f64, f64) = (44.0, -90.0);
const ELEV: f64 = 900.0;

/// A small airplane flown second by second, a point every 5 s; x and y in
/// nm east and north of HOME.
struct Sim {
    x: f64,
    y: f64,
    hdg: f64,
    gs: f64,
    alt: f64,
    t: f64,
    points: Vec<Value>,
}

impl Sim {
    fn new() -> Sim {
        Sim { x: 0.0, y: 0.0, hdg: 0.0, gs: 0.0, alt: ELEV, t: 0.0, points: Vec::new() }
    }
    fn step(&mut self, gs: f64, turn: f64, climb_fpm: f64) {
        self.gs = gs;
        self.hdg = (self.hdg + turn).rem_euclid(360.0);
        self.x += gs / 3600.0 * self.hdg.to_radians().sin();
        self.y += gs / 3600.0 * self.hdg.to_radians().cos();
        self.alt = (self.alt + climb_fpm / 60.0).max(ELEV);
        self.t += 1.0;
        if self.t as i64 % 5 == 0 {
            let lat = HOME.0 + self.y / 60.0;
            let lon = HOME.1 + self.x / (60.0 * HOME.0.to_radians().cos());
            self.points.push(json!({ "t": DAY_MS + self.t * 1000.0, "lat": lat, "lon": lon, "alt_ft": self.alt.round() }));
        }
    }
    fn run(&mut self, s: u32, gs: f64, turn: f64, climb_fpm: f64) {
        for _ in 0..s {
            self.step(gs, turn, climb_fpm);
        }
    }
    fn start(&mut self) {
        self.run(120, 0.0, 0.0, 0.0);
        self.run(90, 10.0, 0.0, 0.0);
        self.run(20, 60.0, 0.0, 0.0);
    }
    fn stop(&mut self) {
        self.run(20, 40.0, 0.0, 0.0);
        self.run(60, 10.0, 0.0, 0.0);
        self.run(120, 0.0, 0.0, 0.0);
    }
    /// A lap of a left pattern from the climb-out to the runway again,
    /// down to `low_ft` above the field at its end.
    fn lap(&mut self, low_ft: f64) {
        self.run(60, 75.0, 0.0, 700.0);
        for leg in [40, 120, 40] {
            self.run(30, 80.0, -3.0, 0.0);
            self.run(leg, 85.0, 0.0, 0.0);
        }
        self.run(30, 75.0, -3.0, 0.0);
        let descend = (self.alt - ELEV - low_ft) / 1.5;
        self.run(90, 70.0, 0.0, -descend);
    }
}

fn field(ident: &str, x: f64, y: f64) -> Value {
    json!({ "ident": ident, "lat": HOME.0 + y / 60.0, "lon": HOME.1 + x / (60.0 * HOME.0.to_radians().cos()), "elevation_ft": ELEV, "towered": false })
}

fn draft(points: &[Value], fields: Value) -> Value {
    ask("logbook_from_track", json!({ "points": points, "fields": fields, "utc_offset_min": -300 }))
}

#[test]
fn laps_of_the_pattern_are_touch_and_goes_then_a_full_stop_and_no_hold() {
    let mut s = Sim::new();
    s.start();
    for _ in 0..3 {
        s.lap(0.0);
        s.run(10, 55.0, 0.0, 0.0);
    }
    s.lap(0.0);
    s.stop();
    let d = draft(&s.points, json!([field("KAAA", 0.0, 0.5)]));
    let kinds: Vec<&str> = d["landings"].as_array().unwrap().iter().map(|l| l["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["touch_and_go", "touch_and_go", "touch_and_go", "full_stop"]);
    assert_eq!(d["entry"]["dayLandings"], 4.0);
    assert_eq!(d["entry"]["nightLandings"], 0.0);
    assert_eq!(d["entry"]["nightHours"], 0.0);
    assert_eq!(d["entry"]["route"], "KAAA");
    assert_eq!(d["holds"], json!([]));
    assert_eq!(d["cross_country"]["landed_elsewhere"], false);
    assert_eq!(d["entry"]["crossCountryHours"], 0.0);
}

#[test]
fn a_low_approach_is_no_landing() {
    let mut s = Sim::new();
    s.start();
    s.lap(200.0);
    s.lap(0.0);
    s.stop();
    let d = draft(&s.points, json!([field("KAAA", 0.0, 0.5)]));
    assert_eq!(d["landings"].as_array().unwrap().len(), 1, "{}", d["landings"]);
    assert_eq!(d["landings"][0]["kind"], "full_stop");
}

/// Out from HOME and down at a field `nm` due north.
fn away(nm: f64) -> Value {
    let mut s = Sim::new();
    s.start();
    s.run(240, 80.0, 0.0, 500.0);
    // Level until the descent at 60 kt and 500 fpm ends at `nm` north.
    while s.y < nm - (s.alt - ELEV) / 500.0 {
        s.run(1, 100.0, 0.0, 0.0);
    }
    s.run(((s.alt - ELEV) / 500.0 * 60.0) as u32, 60.0, 0.0, -500.0);
    s.run(1, 60.0, 0.0, 0.0);
    s.stop();
    let fields = json!([field("KAAA", 0.0, 0.0), field("KBBB", 0.0, s.y)]);
    draft(&s.points, fields)
}

#[test]
fn cross_country_is_a_landing_more_than_50_nm_from_the_departure() {
    // The track is first over 40 kt some 0.1 nm north of HOME: about
    // 49.8 and 50.5 nm, either side of 61.1(b)(ii)'s "more than 50".
    let under = away(49.9);
    assert_eq!(under["entry"]["route"], "KAAA KBBB");
    assert_eq!(under["cross_country"]["landed_elsewhere"], true);
    assert_eq!(under["cross_country"]["over_50_nm"], false, "{}", under["cross_country"]);
    assert_eq!(under["entry"]["crossCountryHours"], 0.0);
    let over = away(50.6);
    assert_eq!(over["cross_country"]["over_50_nm"], true, "{}", over["cross_country"]);
    assert_eq!(over["entry"]["crossCountryHours"], over["entry"]["totalHours"]);
}

#[test]
fn a_track_that_ends_in_the_air_has_no_last_landing() {
    let mut s = Sim::new();
    s.start();
    s.run(600, 90.0, 0.0, 500.0);
    let d = draft(&s.points, json!([field("KAAA", 0.0, 0.5)]));
    assert_eq!(d["ends_airborne"], true);
    assert_eq!(d["landings"], json!([]));
    assert_eq!(d["entry"]["dayLandings"], 0.0);
}

#[test]
fn bad_asks_are_errors() {
    assert!(call("logbook_from_track", r#"{"points": []}"#).is_err());
    assert!(call("logbook_from_track", r#"{"points": [{"t": 0, "lat": 1}]}"#).is_err());
    assert!(call("logbook_from_track", r#"{"points": [{"t":0,"lat":0,"lon":0},{"t":1,"lat":0,"lon":0}], "fields": 3}"#).is_err());
}
