//! The weather reading moved into the engine (#482 phase 2), held to the
//! shared cases in apps/web/src/lib/fixtures/weatherAlong.json: a TAF over a
//! window, the "VFR flight not recommended" reasons, the freezing level,
//! the temperature and wind at an altitude, the winds period, and a
//! field's hours for the airport card. The planner (wingtip_native.call)
//! and the web (callEngine) ask the same names.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

mod common;
use common::assert_same;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/weatherAlong.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// Two JSON values the same, a number to a billionth.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => (x.as_f64().unwrap() - y.as_f64().unwrap()).abs() < 1e-9,
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap()
}

fn check(section: &str, name: &str, input: impl Fn(&Value) -> Value, answer: impl Fn(&Value) -> Value, want: &str) {
    let all = fixture();
    let cases = all[section].as_array().unwrap_or_else(|| panic!("no {section}"));
    assert!(!cases.is_empty(), "{section} has no cases");
    for case in cases {
        let got = answer(&ask(name, input(case)));
        assert!(same(&got, &case[want]), "{section}: {case}\ngot {got}");
    }
}

#[test]
fn a_taf_over_a_window() {
    check(
        "tafWindow",
        "taf_window",
        |c| json!({"fcsts": c["fcsts"], "start": c["start"], "end": c["end"]}),
        |a| a["worst"].clone(),
        "worst",
    );
}

#[test]
fn vfr_not_recommended() {
    check(
        "vfrNotRecommended",
        "vfr_not_recommended_reasons",
        |c| json!({"idents": c["idents"], "metars": c["metars"], "forecast": c["forecast"]}),
        Value::clone,
        "reasons",
    );
}

#[test]
fn aloft() {
    check("freezingLevel", "freezing_level", |c| json!({"profile": c["profile"]}), Value::clone, "level");
    check("temperatureAt", "temperature_at", |c| json!({"profile": c["profile"], "altitude_ft": c["altitude_ft"]}), Value::clone, "temp_c");
    check("windAtAltitude", "wind_at_altitude", |c| json!({"levels": c["levels"], "altitude_ft": c["altitude_ft"]}), Value::clone, "wind");
    check("forecastHour", "forecast_hour", |c| json!({"hours_ahead": c["hours_ahead"]}), Value::clone, "period");
}

#[test]
fn a_fields_hours() {
    let pick = |key: &'static str| move |a: &Value| Value::Array(a.as_array().unwrap().iter().map(|h| h[key].clone()).collect());
    let input = |c: &Value| json!({"metar": c["metar"], "taf": c["taf"], "now": c["now"], "count": c["count"]});
    check("fieldHours", "field_hours", input, pick("category"), "categories");
    check("fieldHours", "field_hours", input, pick("at_times"), "at_times");
}

#[test]
fn the_awc_files_read_and_held() {
    let xml = r#"<response><data><AIRSIGMET><raw_text>WSUS32 KKCI 021655 SIGC CONVECTIVE SIGMET 12C</raw_text>
      <valid_time_from>2026-11-02T16:55:00Z</valid_time_from><valid_time_to>2026-11-02T18:55:00Z</valid_time_to>
      <airsigmet_type>SIGMET</airsigmet_type><hazard type="CONVECTIVE" severity="SEV"/><altitude max_ft_msl="45000"/>
      <area num_points="4"><point><longitude>-90</longitude><latitude>41</latitude></point><point><longitude>-88</longitude><latitude>41</latitude></point>
      <point><longitude>-88</longitude><latitude>43</latitude></point><point><longitude>-90</longitude><latitude>43</latitude></point></area>
      </AIRSIGMET></data></response>"#;
    let advisories = ask("awc_airsigmets_read", json!({"text": xml}));
    let a = &advisories[0];
    assert_eq!(a["hazard"], json!("CONVECTIVE"));
    assert_eq!(a["issued"], json!("2026-11-02T16:55:00Z"));
    assert_eq!(a["coords"].as_array().unwrap().len(), 4);
    let now = a["valid_from"].as_f64().unwrap() + 60.0;
    // A route across the area meets it; one beside it does not.
    let across = ask("sigmets_along_route", json!({"advisories": advisories, "from": [42.0, -91.0], "to": [42.0, -87.0], "now": now}));
    assert_eq!(across.as_array().unwrap().len(), 1);
    let beside = ask("sigmets_along_route", json!({"advisories": advisories, "from": [45.0, -91.0], "to": [45.0, -87.0], "now": now}));
    assert!(beside.as_array().unwrap().is_empty());
    // Held to its own valid time.
    let until = ask("weather_held_until", json!({"product": "airsigmets", "data": advisories, "fetched": now}));
    assert_same(&until, &a["valid_to"], "weather_held_until");
    assert!(call("awc_metars_read", r#"{"text": "<a>"}"#).is_err());
}
