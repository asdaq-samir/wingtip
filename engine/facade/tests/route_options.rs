//! Route options (wingtip_engine::route::options) held to the shared
//! fixture (apps/web/src/lib/fixtures/routeOptions.json): the cases the
//! planner's wingtip.route_options tests asked of the Python before it
//! moved into the engine (#482 phase 5), on an equator where a degree is
//! about 60 nm either way -- the way round a storm by 20 nm (AIM 7-1-27),
//! the pilot's minimums never under 14 CFR 91.155's, the fuel stops landing
//! with 91.151's reserve -- and the four kinds named by what they are.

#![cfg(feature = "route-options")]

use serde_json::Value;
use std::path::PathBuf;
use std::time::Instant;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/routeOptions.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// The ground flat at sea level at every sample the frame names, where a
/// case does not say the ground was not read (`"terrain_ft": null`).
fn flat_ground(mut input: Value) -> Value {
    if input.get("terrain_ft").is_none() {
        let frame: Value = serde_json::from_str(&call("route_options_frame", &input.to_string()).unwrap()).unwrap();
        let per = frame["per_cell"].as_u64().unwrap();
        let samples = frame["rows"].as_u64().unwrap() * per * frame["cols"].as_u64().unwrap() * per;
        input["terrain_ft"] = Value::Array(vec![Value::from(0); samples as usize]);
    }
    input
}

fn options(case: &str) -> (Value, Value) {
    let f = fixture();
    let input = flat_ground(f[case]["input"].clone());
    let answer: Value = serde_json::from_str(&call("route_options", &input.to_string()).unwrap_or_else(|e| panic!("{case}: {e}"))).unwrap();
    (answer, f[case]["expect"].clone())
}

fn names(answer: &Value, key: &str) -> Vec<String> {
    answer[key]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| answer["hazards"][i.as_u64().unwrap() as usize]["name"].as_str().unwrap().to_owned())
        .collect()
}

fn kinds_of(answer: &Value, list: &Value) -> Vec<String> {
    list.as_array().unwrap().iter().map(|i| answer["hazards"][i.as_u64().unwrap() as usize]["kind"].as_str().unwrap().to_owned()).collect()
}

fn way<'a>(answer: &'a Value, kind: &str) -> &'a Value {
    answer["options"].as_array().unwrap().iter().find(|o| o["kinds"].as_array().unwrap().iter().any(|k| k == kind)).unwrap()
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|s| s.as_str().unwrap().to_owned()).collect()
}

/// The nearest a way through `path` comes to a point, nm.
fn nearest_nm(path: &Value, lat: f64, lon: f64) -> f64 {
    let pts: Vec<(f64, f64)> = path.as_array().unwrap().iter().map(|p| (p[0].as_f64().unwrap(), p[1].as_f64().unwrap())).collect();
    let mut best = f64::INFINITY;
    for w in pts.windows(2) {
        for i in 0..50 {
            let t = i as f64 / 49.0;
            let p = (w[0].0 + (w[1].0 - w[0].0) * t, w[0].1 + (w[1].1 - w[0].1) * t);
            best = best.min(wingtip_engine::geo::distance_nm(p.0, p.1, lat, lon));
        }
    }
    best
}

#[test]
fn a_clear_day_is_the_straight_line_for_every_kind() {
    let (answer, expect) = options("clearDay");
    let all = answer["options"].as_array().unwrap();
    assert_eq!(all.len() as u64, expect["options"].as_u64().unwrap());
    assert_eq!(all[0]["kinds"], expect["kinds"]);
    assert_eq!(all[0]["stops"], expect["stops"]);
    assert_eq!(answer["direct"], expect["direct"]);
    assert!((all[0]["distance_nm"].as_f64().unwrap() - expect["distance_nm"].as_f64().unwrap()).abs() <= 2.0);
}

#[test]
fn a_thunderstorm_on_the_line_is_gone_round_by_twenty_miles() {
    let (answer, expect) = options("storm");
    assert_eq!(names(&answer, "direct"), strings(&expect["direct"]));
    let fastest = &answer["options"][0];
    assert!(!fastest["stops"].as_array().unwrap().is_empty(), "a way round needs a turn");
    assert_eq!(fastest["crosses"], expect["crosses"]);
    // AIM 7-1-27's 20 miles, less the grid's half cell.
    let c = &expect["clear_of"];
    assert!(nearest_nm(&fastest["path"], c[0].as_f64().unwrap(), c[1].as_f64().unwrap()) >= c[2].as_f64().unwrap());
    // No fix near: each turn a position of the pilot's own.
    assert!(strings(&fastest["stops"]).iter().all(|s| s.starts_with('@')));
}

#[test]
fn marginal_weather_is_kept_off_by_the_best_weathers_way_alone() {
    let (answer, expect) = options("marginal");
    assert_eq!(answer["direct"], expect["direct"]);
    let fastest = way(&answer, "fastest");
    let best = way(&answer, "weather");
    assert!(fastest["stops"].as_array().unwrap().is_empty() && !fastest["marginal"].as_array().unwrap().is_empty());
    assert!(best["marginal"].as_array().unwrap().is_empty() && best != fastest);
    let bands: Vec<&str> = fastest["bands"].as_array().unwrap().iter().map(|b| b["kind"].as_str().unwrap()).collect();
    assert_eq!(bands, strings(&expect["bands"]));
    // Flat ground at sea level: 91.119's 1,000 ft alone.
    assert_eq!(fastest["floor_ft"], expect["floor_ft"]);
    assert_eq!(fastest["tail_kt"].as_f64(), Some(0.0));
}

#[test]
fn the_pilots_minimums_close_what_the_rules_alone_would_not_and_never_less() {
    for case in ["personalMinimums", "minimumsNeverUnderTheRules"] {
        let (answer, expect) = options(case);
        assert_eq!(kinds_of(&answer, &answer["direct"]), strings(&expect["direct_kinds"]), "{case}");
        if let Some(crosses) = expect.get("crosses") {
            assert!(answer["options"].as_array().unwrap().iter().all(|o| &o["crosses"] == crosses), "{case}");
        }
    }
}

#[test]
fn airspace_and_g_airmets_are_gone_round_and_the_ends_weather_said() {
    for case in ["prohibited", "gairmet"] {
        let (answer, expect) = options(case);
        assert_eq!(names(&answer, "direct"), strings(&expect["direct"]), "{case}");
        assert_eq!(answer["options"][0]["crosses"], expect["crosses"], "{case}");
    }
    let (answer, expect) = options("destinationWeather");
    assert_eq!(names(&answer, "ends"), strings(&expect["ends"]));
    assert_eq!(answer["options"][0]["crosses"], expect["crosses"]);
}

#[test]
fn fuel_stops_land_with_the_reserve_and_the_fewest_kind_lands_least() {
    // 600 nm at 120 kt is 5 h, 50 gal; the tanks hold 49 less 5 of reserve
    // (30 minutes by day, 91.151), 4.4 h or 528 nm.
    let (answer, expect) = options("fuelStops");
    let fastest = way(&answer, "fastest");
    assert!(fastest["landings"].as_u64().unwrap() >= expect["fastest_landings_min"].as_u64().unwrap());
    let fuel = strings(&fastest["fuel"]);
    let mut ends = vec![0.0];
    ends.extend(fuel.iter().map(|f| f[1..].parse::<f64>().unwrap()));
    ends.push(10.0);
    let reach = expect["reach_nm"].as_f64().unwrap();
    assert!(ends.windows(2).all(|w| (w[1] - w[0]) * 60.0 <= reach + 1.0));
    let fewest = way(&answer, "stops");
    assert!(fewest["landings"].as_u64() <= fastest["landings"].as_u64());

    let (answer, expect) = options("noFuelField");
    assert!(!answer["options"].as_array().unwrap().is_empty(), "offered all the same");
    assert!(kinds_of(&answer, &answer["options"][0]["crosses"]).contains(&strings(&expect["crosses_kinds"])[0]));
}

#[test]
fn with_no_airplane_the_ways_have_no_minutes_fuel_or_fuel_stops() {
    // The same 600 nm with no airplane picked: no fuel stop is planned, and
    // the minutes and fuel, which need an airplane, are null -- only the
    // route's own figures (the owner, 2026-11-09: "don't assume").
    let mut input = fixture()["fuelStops"]["input"].clone();
    input["profile"] = Value::Null;
    let answer: Value = serde_json::from_str(&call("route_options", &flat_ground(input).to_string()).unwrap()).unwrap();
    for w in answer["options"].as_array().unwrap().iter().chain([&answer["own"]]) {
        assert!(w["air_min"].is_null() && w["fuel_gal"].is_null(), "{w}");
        assert_eq!(w["landings"], 0);
        assert!(w["fuel"].as_array().unwrap().is_empty());
        assert!(w["distance_nm"].as_f64().unwrap() >= 590.0);
    }
}

#[test]
fn a_meal_is_had_among_chains_of_as_many_stops_and_a_landing_is_a_refuel() {
    let (answer, expect) = options("food");
    assert_eq!(answer["own"]["fuel"], expect["own_fuel"]);
    assert_eq!(answer["own"]["food"], expect["own_food"]);
    let (answer, expect) = options("landed");
    assert_eq!(answer["own"]["stops"], expect["own_stops"]);
    assert_eq!(answer["own"]["fuel"], expect["own_fuel"]);
    assert_eq!(answer["own"]["landings"], expect["own_landings"]);
    assert_eq!(answer["own"]["ground_min"].as_f64(), expect["own_ground_min"].as_f64());
}

#[test]
fn a_source_not_read_is_said() {
    let (answer, expect) = options("unread");
    assert_eq!(answer["unchecked"], expect["unchecked"]);
    assert!(!answer["options"].as_array().unwrap().is_empty());
}

/// A rough timing, printed with --nocapture: a long route (about 900 nm)
/// with a line of storms across it, fields along it, its ground and ten
/// thousand fixes round it, the JSON read and written as the planner asks.
#[test]
fn a_long_route_is_worked_out_in_good_time() {
    let mut input = fixture()["fuelStops"]["input"].clone();
    input["dest"]["lon"] = Value::from(15.0);
    input["tafs"] = Value::Array(
        (0..6).map(|k| serde_json::json!({"ident": format!("S{k}"), "lat": -1.5 + k as f64 * 0.6, "lon": 7.0, "wx": ["TSRA"]})).collect(),
    );
    input["fixes"] = Value::Array(
        (0..10_000)
            .map(|k| {
                serde_json::json!({"ident": format!("FX{:03}", k % 1000), "lat": -3.0 + (k / 100) as f64 * 0.06,
        "lon": -3.0 + (k % 100) as f64 * 0.21, "navaid": k % 50 == 0, "vfr": false, "kind": "fix"})
            })
            .collect(),
    );
    let input = flat_ground(input).to_string();
    let started = Instant::now();
    let answer: Value = serde_json::from_str(&call("route_options", &input).unwrap()).unwrap();
    println!("route_options, 900 nm round a line of storms: {:?}", started.elapsed());
    assert!(!answer["options"].as_array().unwrap().is_empty());
}
