//! What is ahead of own ship (`ahead_frame`, `alerts_ahead`) against the
//! shared fixture apps/web/src/lib/fixtures/ahead.json, the cases
//! wingtip.alerts' tests held the planner to; and 14 CFR 91.119(b)'s
//! congested areas (`congested_points`) against congested.json.

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures").join(name);
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

/// Degrees of longitude in a nautical mile at the fixture's latitude.
fn mile(lat: f64) -> f64 {
    1.0 / (60.0 * lat.to_radians().cos())
}

/// A box across the track `from`..`to` nm ahead (east), 2 nm either side.
fn east(own: &Value, span: &Value) -> Value {
    let (lat, lon) = (own["lat"].as_f64().unwrap(), own["lon"].as_f64().unwrap());
    let (a, b) = (span[0].as_f64().unwrap(), span[1].as_f64().unwrap());
    let (w, e) = (lon + a * mile(lat), lon + b * mile(lat));
    let (s, n) = (lat - 2.0 / 60.0, lat + 2.0 / 60.0);
    json!([[[[w, s], [e, s], [e, n], [w, n], [w, s]]]])
}

/// The fixture's areas with their boxes as polygons.
fn areas(own: &Value, list: &Value) -> Value {
    match list {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|a| {
                    let mut a = a.as_object().unwrap().clone();
                    let span = a.remove("east").unwrap();
                    a.insert("polygons".into(), east(own, &span));
                    Value::Object(a)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

fn input(own: &Value, case: &Value) -> Value {
    let mut given: Map<String, Value> = own.as_object().unwrap().clone();
    if let Some(o) = case.get("own") {
        given.extend(o.as_object().unwrap().clone());
    }
    let own = Value::Object(given.clone());
    given.insert("ground_ft".into(), case.get("ground_ft").cloned().unwrap_or(json!(800.0)));
    given.insert("airspace".into(), areas(&own, case.get("airspace").unwrap_or(&json!([]))));
    given.insert("special_use".into(), areas(&own, case.get("special_use").unwrap_or(&json!([]))));
    given.insert("tfrs".into(), areas(&own, case.get("tfrs").unwrap_or(&json!([]))));
    given.insert("near_field".into(), case.get("near_field").cloned().unwrap_or(json!({ "distance_nm": 20.0, "elevation_ft": 800.0 })));
    // The ground under the swath the engine names.
    let ground = case.get("ground").cloned().unwrap_or(json!({ "low_ft": 800.0 }));
    let swath = if ground.is_null() {
        Value::Null
    } else {
        let frame = ask("ahead_frame", &own);
        let lon0 = own["lon"].as_f64().unwrap();
        let step = ground.get("from_nm").and_then(Value::as_f64).map(|nm| lon0 + nm * mile(own["lat"].as_f64().unwrap()));
        let rows: Vec<Value> = frame["lons"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| {
                Value::Array(
                    row.as_array()
                        .unwrap()
                        .iter()
                        .map(|lon| {
                            let high = step.is_some_and(|s| lon.as_f64().unwrap() > s);
                            if high { ground["high_ft"].clone() } else { ground["low_ft"].clone() }
                        })
                        .collect(),
                )
            })
            .collect();
        assert_eq!(rows.len(), 3);
        Value::Array(rows)
    };
    given.insert("swath_ground_ft".into(), swath);
    let obstacles: Vec<Value> = case
        .get("obstacles")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|o| {
                    let lat = own["lat"].as_f64().unwrap() + o["north_nm"].as_f64().unwrap() / 60.0;
                    let lon = own["lon"].as_f64().unwrap() + o["ahead_nm"].as_f64().unwrap() * mile(own["lat"].as_f64().unwrap());
                    json!({ "lat": lat, "lon": lon, "amsl_ft": o["amsl_ft"], "type": o["type"] })
                })
                .collect()
        })
        .unwrap_or_default();
    given.insert("obstacles".into(), Value::Array(obstacles));
    Value::Object(given)
}

#[test]
fn whats_ahead_is_the_fixtures() {
    let f = fixture("ahead.json");
    for case in f["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let got = ask("alerts_ahead", &input(&f["own"], case));
        let alerts = got["alerts"].as_array().unwrap();
        let want = case["alerts"].as_array().unwrap();
        // A case that names its alerts by name is held to that set, in any
        // order; otherwise to the list in order.
        let by_name = want.iter().all(|w| w.get("name").is_some());
        assert_eq!(alerts.len(), want.len(), "{name}: {got}");
        for (k, w) in want.iter().enumerate() {
            let a = if by_name {
                alerts.iter().find(|a| a["name"] == w["name"]).unwrap_or_else(|| panic!("{name}: no {}", w["name"]))
            } else {
                &alerts[k]
            };
            for (key, v) in w.as_object().unwrap() {
                if let Some(base) = key.strip_suffix("_about") {
                    let (x, tol) = (v[0].as_f64().unwrap(), v[1].as_f64().unwrap());
                    let g = a[base].as_f64().unwrap();
                    assert!((g - x).abs() <= tol, "{name}: {base} {g} not {x} +- {tol}");
                } else if key == "need_has" {
                    assert!(a["need"].as_str().unwrap().contains(v.as_str().unwrap()), "{name}: {}", a["need"]);
                } else if v.is_number() {
                    assert_eq!(a[key].as_f64(), v.as_f64(), "{name}: {key} in {a}");
                } else {
                    assert_eq!(&a[key], v, "{name}: {key} in {a}");
                }
            }
        }
        let unavailable = case.get("unavailable").cloned().unwrap_or(json!([]));
        assert_eq!(got["unavailable"], unavailable, "{name}");
    }
}

#[test]
fn the_frame_boxes_the_track() {
    let own = fixture("ahead.json")["own"].clone();
    let frame = ask("ahead_frame", &own);
    let b = frame["box"].as_array().unwrap();
    // [south, west, north, east] round ten miles east of 42 N 88 W.
    assert!(b[0].as_f64().unwrap() < 42.0 && b[2].as_f64().unwrap() > 42.0);
    assert!(b[1].as_f64().unwrap() < -88.0 && b[3].as_f64().unwrap() > -88.0 + 10.0 * mile(42.0));
    assert_eq!(frame["lats"].as_array().unwrap().len(), 3);
    assert_eq!(frame["lats"][0].as_array().unwrap().len(), 31);
}

#[test]
fn congested_areas_are_the_fixtures() {
    let f = fixture("congested.json");
    for case in f["cases"].as_array().unwrap() {
        let got = ask("congested_points", &json!({ "areas": f["areas"], "points": case["points"], "candidates": case.get("candidates") }));
        assert_eq!(got, case["congested"], "{}", case["name"]);
    }
}
