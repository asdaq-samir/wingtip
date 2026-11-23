use super::runways_cases::c172;
use super::*;

// --- pass times -------------------------------------------------------------

pub(super) const LEGS: [(f64, Option<f64>); 2] = [(50.0, Some(30.0)), (100.0, Some(50.0))];

/// Microseconds since 1970 of a UTC time on a day of October 2026 (or
/// January 2027 with `month` 1).
pub(super) fn utc(year: i64, month: u32, day: u32, hour: i64, minute: i64) -> i64 {
    let days = wingtip_engine::time::days_from_civil(year, month, day);
    ((days * 24 + hour) * 60 + minute) * 60_000_000
}

#[test]
fn the_departure_plus_the_legs_times_the_leg_it_is_in_pro_rata() {
    assert_eq!(pass_times::pass_minutes(&LEGS, 25.0), Some(15.0));
    assert_eq!(pass_times::pass_minutes(&LEGS, 100.0), Some(55.0));
    // Past the end, the arrival.
    assert_eq!(pass_times::pass_minutes(&LEGS, 400.0), Some(80.0));
    assert_eq!(pass_times::pass_minutes(&[], 10.0), None);
    assert_eq!(pass_times::pass_minutes(&[(50.0, None)], 10.0), None);
}

#[test]
fn a_tfrs_window_against_the_pass_half_an_hour_either_side() {
    let (from, to) = (Some(utc(2026, 10, 6, 16, 0)), Some(utc(2026, 10, 6, 18, 0)));
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 15, 0), from, to), "before");
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 15, 45), from, to), "in-force");
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 19, 0), from, to), "after");
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 19, 0), None, None), "in-force");
    // The margin's edges are inside.
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 15, 30), from, to), "in-force");
    assert_eq!(pass_times::tfr_when(utc(2026, 10, 6, 18, 30), from, to), "in-force");
}

/// Tuesday 6 October 2026, 14:20Z.
pub(super) const TUESDAY_1420Z: (u32, u32) = (2, 14 * 60 + 20);

#[test]
fn a_special_use_areas_published_times_of_use() {
    let at = |t: &str, utc: (u32, u32)| pass_times::sua_when(Some(t), utc, None);
    assert_eq!(at("CONTINUOUS", TUESDAY_1420Z), "active");
    assert_eq!(at("INTERMITTENT BY NOTAM 4 HOURS IN ADVANCE", TUESDAY_1420Z), "by-notam");
    assert_eq!(at("1400 - 2200Z, MON - FRI", TUESDAY_1420Z), "active");
    assert_eq!(at("1500 - 2200Z, MON - FRI; OTHER TIMES BY NOTAM", TUESDAY_1420Z), "by-notam");
    assert_eq!(at("1400 - 2200Z, SAT - SUN", TUESDAY_1420Z), "not-scheduled");
    // Tuesday 02:00Z.
    assert_eq!(at("2200 - 0600Z", (2, 120)), "active");
    assert_eq!(at("SR - SS", TUESDAY_1420Z), "unknown");
    assert_eq!(pass_times::sua_when(None, TUESDAY_1420Z, None), "unknown");
    assert_eq!(at("H24", TUESDAY_1420Z), "active");
    assert_eq!(at("BH24", TUESDAY_1420Z), "unknown");
}

#[test]
fn local_hours_are_read_on_the_areas_own_clock() {
    // The clocks the caller works out: 14:20Z on Tuesday 6 October 2026 is
    // 08:20 MDT in Denver and 07:20 MST in Phoenix.
    let hours = Some("0800 - 1700, MON - FRI; OTHER TIMES BY NOTAM");
    assert_eq!(pass_times::sua_when(hours, TUESDAY_1420Z, Some((2, 8 * 60 + 20))), "active");
    assert_eq!(pass_times::sua_when(hours, TUESDAY_1420Z, Some((2, 7 * 60 + 20))), "by-notam");
    assert_eq!(pass_times::sua_when(Some("0700 - 0800 MST, MON - FRI"), TUESDAY_1420Z, Some((2, 7 * 60 + 20))), "active");
    // Hawaii's 17:00 on Monday is Tuesday 03:00Z.
    assert_eq!(pass_times::sua_when(Some("0800 - 1800, MON"), (2, 180), Some((1, 17 * 60))), "active");
    // No zone for the area: its local hours are not guessed at; UTC ranges need none.
    assert_eq!(pass_times::sua_when(hours, TUESDAY_1420Z, None), "unknown");
    assert_eq!(pass_times::sua_when(Some("1400 - 2200Z, MON - FRI"), TUESDAY_1420Z, None), "active");
}

#[test]
fn every_range_is_read_each_with_its_own_clauses_days() {
    // Saturday 3 October 2026, 11:00 CDT (16:00Z).
    let (z, local) = ((6, 16 * 60), Some((6, 11 * 60)));
    let at = |t: &str| pass_times::sua_when(Some(t), z, local);
    assert_eq!(at("0800 - 1600, MON - FRI; 1000 - 1400, SAT; OTHER TIMES BY NOTAM"), "active");
    assert_eq!(at("0800 - 1600, MON - FRI; OTHER TIMES BY NOTAM"), "by-notam");
    assert_eq!(at("0600 - 0900, 1030 - 1200, MON - SAT, BY NOTAM 2 HOURS IN ADVANCE; %1300 - 1500, FRI"), "active");
    assert_eq!(at("0700 - 0900, MON - FRI; OTHER TIMES BY NOTAM BETWEEN 0600 - 2200"), "by-notam");
    // A range past midnight belongs to the day it began: Saturday 01:00 CDT.
    let late = |t: &str| pass_times::sua_when(Some(t), (6, 6 * 60), Some((6, 60)));
    assert_eq!(late("2300 - 0200, FRI"), "active");
    assert_eq!(late("2300 - 0200, SAT"), "not-scheduled");
    assert_eq!(at("0700 - 1600, DAILY"), "active");
    assert_eq!(at("0700 - 1600, SUN - TUE"), "not-scheduled");
    assert_eq!(at("0700 - 1600, FRI - SUN"), "active");
    assert_eq!(at("0700 - 1600 MONDAY"), "active");
}

// --- by name (crate::call) ----------------------------------------------------

pub(super) fn call(name: &str, input: &str) -> Value {
    serde_json::from_str(&wingtip_engine::call::call(name, input).unwrap()).unwrap()
}

#[test]
fn every_rule_answers_by_name_from_the_planners_and_the_webs_own_objects() {
    let quiet = r#"{"weather": {"pending": false, "failed": null, "vfr_not_recommended": [], "under_minimums": [], "hazards": [], "unchecked": [], "worst": "3,500 ft · 6 sm"},
        "airspace": {"pending": false, "unchecked": false, "in_force": [], "near": 0, "special_use": []},
        "altitude": {"pending": false, "problem": null, "cautions": [], "flown": "FL-055 · Lowest"},
        "fuel": {"pending": false, "margin_gal": 12.4, "required_gal": 27.6, "reserve_min": 30},
        "runways": {"pending": false, "worked": true, "short": [], "crosswind": []},
        "balance": {"pending": false, "worked": true, "problems": [], "takeoff": "2,407 lb at 41.2 in"},
        "risk": {"level": "low", "line": "Low · 2 points"}}"#;
    let brief = |alternate: &str| call("gonogo_brief", &format!(r#"{{"verdict": {quiet}, "alternate": {alternate}, "airplane": true}}"#));
    let fuel = |b: &Value| b["items"].as_array().unwrap().iter().find(|i| i["key"] == "fuel").unwrap()["detail"].clone();
    assert_eq!(fuel(&brief("null")), "Needs 27.6 gal with taxi and a 30 min reserve; 12.4 gal beyond reserve");
    // Under IFR, the whole verdict as the planner's app.gonogo puts it
    // together: the items, the alternate's say in the weather's, the line
    // over them (14 CFR 91.169(a): an alternate the destination needs and
    // none filed).
    let ifr = quiet.replacen(r#""weather": {"pending": false,"#, r#""weather": {"pending": false, "ifr": true,"#, 1);
    let ifr_brief = |alternate: &str| call("gonogo_brief", &format!(r#"{{"verdict": {ifr}, "alternate": {alternate}, "airplane": true}}"#));
    let alternate_of = |b: &Value| b["items"].as_array().unwrap().iter().find(|i| i["section"] == "Alternate").cloned();
    let none_filed = ifr_brief(r#"{"destination": {"required": true}, "alternate": null}"#);
    assert!(alternate_of(&none_filed).is_some());
    assert_eq!(none_filed["line"]["finding"], "caution");
    // An alternate with no `good` at all says nothing; one with good null
    // is the pilot's to check (useAlternate's `=== null`).
    assert!(alternate_of(&ifr_brief(r#"{"destination": {"required": true}, "alternate": {"ident": "KMSN", "reasons": []}}"#)).is_none());
    assert_eq!(
        alternate_of(&ifr_brief(r#"{"destination": {"required": true}, "alternate": {"ident": "KMSN", "good": null, "reasons": []}}"#))
            .unwrap()["detail"],
        "KMSN: check it"
    );
    let under = call(
        "gonogo_under_minimums",
        r#"{"minimums": {"crosswind_kt": 15}, "landings": ["C81"], "dest": "KDLH",
        "metars": {"C81": {"wind_speed_kt": 15, "wind_gust_kt": 25}}, "airports": {"C81": {"runways": [{"closed": false, "wind": null}]}},
        "forecast": {"stations": []}}"#,
    );
    assert_eq!(under[0], "C81 variable wind 25 kt, which may all be crosswind, over your 15 kt");
    let risk = call(
        "gonogo_risk",
        r#"{"day": "2026-10-05", "night": true, "hazards": 1, "ticked": {"pressure": true}, "ifr": true, "vor_check": null}"#,
    );
    assert_eq!((risk["score"].as_i64(), risk["line"].as_str()), (Some(10), Some("Raised · 10 points")));
    assert_eq!(risk["factors"][2]["key"], "vor");
    assert!(risk["factors"][3]["finding"].is_null());
    let none = call("gonogo_risk", r#"{"day": "2026-10-05", "ifr": true}"#);
    assert_eq!(none["factors"].as_array().unwrap().len(), 0);
    let icing = call(
        "gonogo_icing",
        r#"{"selection": {"freezing_level_ft": 5000, "icing_possible": true}, "flown_ft": [6000], "pireps": [{"icing": "MOD"}]}"#,
    );
    assert_eq!(icing["reports"], 1);
    assert_eq!(
        call("gonogo_picked_end", r#"{"picks": {"pattern": [[" kues", "10"]]}, "ident": "UES", "kind": "landing", "departure": false}"#),
        "10"
    );
    assert_eq!(call("gonogo_sua_when", r#"{"times_of_use": "1400 - 2200Z, MON - FRI", "utc": [2, 860]}"#), "active");
    assert_eq!(call("gonogo_tfr_when", r#"{"at_us": 0, "effective_us": 3600000000}"#), "before");
    assert_eq!(
        call(
            "gonogo_pass_minutes",
            r#"{"legs": [{"distance_nm": 50, "ete_min": 30}, {"distance_nm": 100, "ete_min": 50}], "along_nm": 100}"#
        ),
        55.0
    );
    assert_eq!(call("gonogo_runway_number", r#"{"ident": "09"}"#), "9");
    assert_eq!(call("gonogo_soft_surface", r#"{"surface": "TURF"}"#), true);
    let c172 = c172();
    let checks = call("gonogo_runway_checks", &serde_json::json!({
        "aircraft": {"takeoff": c172["takeoff"], "landing": c172["landing"], "crosswind": c172["crosswind"]},
        "fields": [{"ident": "C81", "elevation_ft": 900}, {"ident": "KDLH", "elevation_ft": 1400}],
        "metars": {"C81": {"temp_c": 15, "altimeter_in_hg": 29.92, "wind_dir_true_deg": null, "wind_speed_kt": 12, "wind_gust_kt": 22}, "KDLH": {}},
        "airports": {"C81": {"runways": [{"length_ft": 5000, "surface": "ASP", "closed": false, "runway_ends": [], "wind": null}]}},
        "takeoff_lb": 2550, "landing_lb": 2400,
    }).to_string());
    assert_eq!((checks[0]["crosswind_kt"].as_f64(), checks[0]["crosswind_over"].as_bool()), (Some(22.0), Some(true)));
    // An empty report is a report, as the web reads it.
    assert_eq!(checks[1]["reported"], true);
    let b = call("gonogo_balance", &serde_json::json!({
        "loading": c172["loading"], "load": {"empty_weight_lb": 1642, "empty_arm_in": 38.1, "stations_lb": [170, 400, 120, 50], "fuel_gal": 53},
        "trip_fuel_gal": 10,
    }).to_string());
    assert!(b["problems"].as_array().unwrap().iter().any(|p| p == "The takeoff weight, 2,692 lb, is 142 lb over its most"));
    assert_eq!(
        call("gonogo_default_load", &serde_json::json!({"loading": c172["loading"], "fuel_gal": 40}).to_string())["empty_arm_in"],
        38.12
    );
}

#[test]
fn a_bad_ask_is_an_error_not_a_panic() {
    let err = |name: &str, input: &str| wingtip_engine::call::call(name, input).unwrap_err();
    assert!(err("gonogo_brief", r#"{"verdict": {}}"#).contains("\"weather\" is missing"));
    assert!(err("gonogo_risk", r#"{"day": 5}"#).contains("not a string"));
    assert!(err("gonogo_sua_when", r#"{"utc": [9, 0]}"#).contains("day 0-6"));
    assert!(err("gonogo_nope", "{}").contains("no rule called"));
}
