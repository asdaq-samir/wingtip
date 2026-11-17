use super::*;

// --- Traffic ----------------------------------------------------------------

pub(super) fn plane(over: Value) -> Value {
    let mut p = json!({
        "hex": "a128b9", "callsign": "N174HA", "lat": 42.3246, "lon": -88.0741, "altitude_ft": 3520,
        "pressure_altitude": false, "track_deg": 92, "speed_kt": 110, "vertical_fpm": 0,
    });
    for (k, v) in over.as_object().unwrap() {
        p[k] = v.clone();
    }
    p
}

pub(super) fn fix(over: Value) -> Value {
    let mut f = json!({ "lat": 42.3246, "lon": -88.0741, "heading_deg": 90, "speed_kt": 112, "altitude_ft": 3000 });
    for (k, v) in over.as_object().unwrap() {
        f[k] = v.clone();
    }
    f
}

pub(super) fn mark(p: &Value, own: Value) -> Value {
    ask("traffic_marks", json!({ "own_ft": own, "planes": [{ "altitude_ft": p["altitude_ft"], "vertical_fpm": p["vertical_fpm"] }] }))[0]
        .clone()
}

pub(super) fn label(p: &Value, own: Value) -> String {
    mark(p, own)["label"].as_str().unwrap().to_owned()
}

pub(super) fn near(p: &Value, own: Value) -> bool {
    mark(p, own)["near"].as_bool().unwrap()
}

#[test]
fn heights_are_written_against_own_ships_in_hundreds_as_tcas_does() {
    assert_eq!(label(&plane(json!({})), json!(3000)), "+05");
    assert_eq!(label(&plane(json!({ "altitude_ft": 1800 })), json!(3000)), "-12");
    assert_eq!(label(&plane(json!({ "altitude_ft": 3020 })), json!(3000)), "+00");
    // An arrow at 500 ft a minute and more.
    assert_eq!(label(&plane(json!({ "vertical_fpm": 500 })), json!(3000)), "+05↑");
    assert_eq!(label(&plane(json!({ "vertical_fpm": -800 })), json!(3000)), "+05↓");
    assert_eq!(label(&plane(json!({ "vertical_fpm": 400 })), json!(3000)), "+05");
    // Its own height where own ship's is not known; nothing where it sends none.
    assert_eq!(label(&plane(json!({ "altitude_ft": 4525 })), Value::Null), "4,500");
    assert_eq!(label(&plane(json!({ "altitude_ft": null })), json!(3000)), "");
}

#[test]
fn near_own_ships_height_is_within_1000_ft() {
    assert!(near(&plane(json!({ "altitude_ft": 3990 })), json!(3000)));
    assert!(!near(&plane(json!({ "altitude_ft": 4100 })), json!(3000)));
    assert!(!near(&plane(json!({})), Value::Null));
    // nearInHeight: the difference itself, against nothing.
    assert!(near(&json!({ "altitude_ft": -1000 }), json!(0)));
    assert!(!near(&json!({ "altitude_ft": 1000.01 }), json!(0)));
}

#[test]
fn the_shared_traffic_fixture() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/traffic.json");
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let cases = fixture["cases"].as_array().unwrap();
    assert!(cases.len() >= 20);
    for case in cases {
        let p = plane(json!({ "altitude_ft": case["plane"]["altitude_ft"], "vertical_fpm": case["plane"]["vertical_fpm"] }));
        assert_eq!(label(&p, case["ownFt"].clone()), case["label"].as_str().unwrap(), "{case}");
        assert_eq!(near(&p, case["ownFt"].clone()), case["near"].as_bool().unwrap(), "{case}");
    }
}

pub(super) fn own_hex(planes: Value, fix: Value) -> Value {
    ask("own_ship_hex", json!({ "planes": planes, "fix": fix }))
}

#[test]
fn own_ships_own_transponder_is_known_and_no_other() {
    // Where it is, as high, the same way, as fast.
    assert_eq!(own_hex(json!([plane(json!({ "altitude_ft": 3100 }))]), fix(json!({}))), "a128b9");
    // Still known when the answer is old: 40 s at 112 kt is 1.2 nm, taken
    // back with the age (the web's agedBy adds it to seen_s).
    let behind = plane(json!({ "lon": -88.0741 - 0.0268, "altitude_ft": 3100 }));
    assert_eq!(own_hex(json!([behind]), fix(json!({}))), Value::Null);
    assert_eq!(own_hex(json!([plane(json!({ "lon": -88.0741 - 0.0268, "altitude_ft": 3100, "seen_s": 40 }))]), fix(json!({}))), "a128b9");
    // Not another airplane.
    for other in [json!({ "track_deg": 270 }), json!({ "altitude_ft": 3600 }), json!({ "lat": 42.34 }), json!({ "speed_kt": 60 })] {
        assert_eq!(own_hex(json!([plane(other.clone())]), fix(json!({}))), Value::Null, "{other}");
    }
    assert_eq!(own_hex(json!([plane(json!({}))]), Value::Null), Value::Null);
    // Only the nearest match, so a wingman stays drawn.
    let wing = plane(json!({ "hex": "wing", "altitude_ft": 3100, "lat": 42.3246 + 0.002 }));
    assert_eq!(own_hex(json!([wing, plane(json!({ "altitude_ft": 3100 }))]), fix(json!({}))), "a128b9");
    // The feed's age: own ship was further back when it was heard.
    let heard = plane(json!({ "altitude_ft": 3100, "lon": -88.0741 - 0.0147, "seen_s": 30 }));
    assert_eq!(own_hex(json!([heard]), fix(json!({}))), "a128b9");
    let mut now = heard.clone();
    now["seen_s"] = json!(0);
    assert_eq!(own_hex(json!([now]), fix(json!({}))), Value::Null);
}

#[test]
fn the_closest_approach_of_one_coming_head_on_and_one_drawing_apart() {
    let own = fix(json!({ "lat": 42, "lon": -88, "heading_deg": 90, "speed_kt": 120, "altitude_ft": 3000 }));
    // Ten miles east, coming west at 120 kt, 500 ft above: they meet in 2.5
    // minutes, closing at 240 kt.
    let east = -88.0 + 10.0 / (60.0 * (42.0_f64 * std::f64::consts::PI / 180.0).cos());
    let cpa = ask(
        "closest_approach",
        json!({ "own": own, "plane": plane(json!({ "lat": 42, "lon": east, "track_deg": 270, "speed_kt": 120, "altitude_ft": 3500 })) }),
    );
    assert!(close(n(&cpa["in_min"]), 2.5, 0.05), "{cpa}");
    assert!(close(n(&cpa["nm"]), 0.0, 0.05), "{cpa}");
    assert!(close(n(&cpa["above_ft"]), 500.0, 0.5), "{cpa}");
    let apart = ask(
        "closest_approach",
        json!({ "own": own, "plane": plane(json!({ "lat": 42, "lon": -88.1, "track_deg": 270, "speed_kt": 120, "altitude_ft": 3000 })) }),
    );
    assert_eq!(n(&apart["in_min"]), 0.0);
    // Nothing without a track or speed.
    assert_eq!(ask("closest_approach", json!({ "own": fix(json!({ "heading_deg": null })), "plane": plane(json!({})) })), Value::Null);
    assert_eq!(ask("closest_approach", json!({ "own": own, "plane": plane(json!({ "speed_kt": null })) })), Value::Null);
}

// --- Alerts -----------------------------------------------------------------

pub(super) fn airborne(before: Value, airborne: bool, arrived: bool, heard: Value) -> Value {
    ask("airborne_now", json!({ "before": before, "airborne": airborne, "arrived": arrived, "heard_s": heard }))
}

#[test]
fn in_the_air_where_heard_there_down_where_landed_and_gone_quiet_still_flying() {
    assert_eq!(airborne(Value::Null, true, false, json!(4)), json!(true));
    assert_eq!(airborne(json!(true), false, true, json!(4)), json!(false));
    // Unheard half a minute, no landing known: still in the air.
    assert_eq!(airborne(json!(true), false, false, json!(40)), json!(true));
    // Never heard, or not for half an hour: parked.
    assert_eq!(airborne(Value::Null, false, false, Value::Null), json!(false));
    assert_eq!(airborne(Value::Null, false, false, json!(3600)), json!(false));
    assert_eq!(airborne(Value::Null, false, false, json!(1800)), json!(false));
    assert_eq!(airborne(Value::Null, false, false, json!(40)), Value::Null);
}

#[test]
fn alerts_go_off_once_as_it_happens() {
    let fires = |input: Value| ask("alert_fires", input);
    // Takes off: from the ground into the air.
    assert_eq!(fires(json!({ "kind": "takeoff", "before_airborne": false, "airborne": true }))["fires"], json!(true));
    assert_eq!(fires(json!({ "kind": "takeoff", "before_airborne": true, "airborne": true }))["fires"], json!(false));
    assert_eq!(fires(json!({ "kind": "takeoff", "before_airborne": null, "airborne": true }))["fires"], json!(false));
    // Lands: from the air to a field, only once it is known where.
    assert_eq!(fires(json!({ "kind": "land", "before_airborne": true, "airborne": false, "arrived": true }))["fires"], json!(true));
    assert_eq!(fires(json!({ "kind": "land", "before_airborne": true, "airborne": true, "arrived": false }))["fires"], json!(false));
    assert_eq!(fires(json!({ "kind": "land", "before_airborne": false, "airborne": false, "arrived": true }))["fires"], json!(false));
    // Comes near me: 7 nm north-east of own ship, within the 10 picked.
    let me = json!({ "lat": 42.0, "lon": -88.0 });
    let close_by = json!({ "lat": 42.1, "lon": -87.9 });
    let first = fires(json!({ "kind": "near", "before_airborne": true, "airborne": true, "plane": close_by, "to": me, "limit_nm": 10 }));
    assert_eq!((first["fires"].clone(), first["inside"].clone()), (json!(true), json!(true)));
    assert_eq!(n(&first["nm"]).round(), 7.0);
    assert!(n(&first["bearing_deg"]) > 22.5 && n(&first["bearing_deg"]) < 67.5, "north-east: {first}");
    // Already near at the last answer: not said again.
    let again = fires(json!({ "kind": "near", "was_inside": true, "plane": close_by, "to": me, "limit_nm": 10 }));
    assert_eq!((again["fires"].clone(), again["inside"].clone()), (json!(false), json!(true)));
    // Further than picked, or no fix of own ship.
    let far = fires(json!({ "kind": "near", "plane": { "lat": 43.0, "lon": -88.0 }, "to": me, "limit_nm": 10 }));
    assert_eq!((far["fires"].clone(), far["inside"].clone()), (json!(false), json!(false)));
    assert_eq!(fires(json!({ "kind": "near", "plane": close_by, "to": null, "limit_nm": 10 }))["inside"], Value::Null);
    // Comes near an airport: 6 nm from 10C.
    let galt = json!({ "lat": 42.4027, "lon": -88.3751 });
    let inbound = fires(json!({ "kind": "near", "plane": { "lat": 42.45, "lon": -88.25 }, "to": galt, "limit_nm": 10 }));
    assert_eq!(inbound["fires"], json!(true));
    assert_eq!(n(&inbound["nm"]).round(), 6.0);
    assert_eq!(fires(json!({ "kind": "near", "plane": { "lat": 42.9, "lon": -88.3 }, "to": galt, "limit_nm": 10 }))["fires"], json!(false));
}
