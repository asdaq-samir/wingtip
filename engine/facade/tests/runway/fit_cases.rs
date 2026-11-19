use super::*;

// --- the runway fit (runwayFit.test.ts) and short-field distances ---------

pub(super) fn c172() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/aircraft/c172.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

pub(super) fn fit(runway_ft: f64, surface: &str, wind: Value, extra: Value) -> Value {
    let mut input = json!({
        "aircraft": c172(), "runway": {"length_ft": runway_ft, "surface": surface, "closed": false, "runway_ends": []},
        "end": {"ident": "27", "heading_true_deg": 270}, "wind": wind, "elevation_ft": 900, "altimeter_in_hg": 29.92, "temp_c": 15,
        "weight_lb": 2550, "kind": "takeoff",
    });
    for (k, v) in extra.as_object().unwrap() {
        input[k] = v.clone();
    }
    ask("runway_end_fit", input)
}

#[test]
fn an_ends_crosswind_its_gusts_where_more_against_the_pohs_demonstrated_15_kt() {
    let f = fit(5000.0, "ASP", json!({"dir_true_deg": 360, "speed_kt": 12, "gust_kt": 20}), json!({}));
    assert_eq!((num(&f["crosswind_kt"]), f["crosswind_over"].clone()), (20.0, json!(true)));
    assert_eq!(num(&fit(5000.0, "ASP", json!({"dir_true_deg": 270, "speed_kt": 12}), json!({}))["crosswind_kt"]), 0.0);
    // A variable wind may blow straight across: all of it, gusts included.
    assert_eq!(num(&fit(5000.0, "ASP", json!({"dir_true_deg": null, "speed_kt": 15, "gust_kt": 25}), json!({}))["crosswind_kt"]), 25.0);
}

#[test]
fn a_runway_shorter_than_the_distance_over_50_ft_and_one_within_safo_19001s_15_per_cent() {
    let still = json!({"dir_true_deg": null, "speed_kt": 0});
    let needed = num(&fit(10000.0, "ASP", still.clone(), json!({}))["needed_ft"]);
    assert!(needed > 1000.0);
    assert_eq!(fit(needed - 1.0, "ASP", still.clone(), json!({}))["short"], json!(true));
    let close = fit((needed * 1.1).round(), "ASP", still.clone(), json!({}));
    assert_eq!((close["short"].clone(), close["close"].clone()), (json!(false), json!(true)));
    assert_eq!(fit(needed * 2.0, "ASP", still, json!({}))["close"], json!(false));
}

#[test]
fn the_fit_is_the_runway_checks_own_distance() {
    // 270 at 10 straight down 27, a grass runway, a warm low day.
    let f = fit(3000.0, "TURF", json!({"dir_true_deg": 270, "speed_kt": 10}), json!({"temp_c": 30, "altimeter_in_hg": 29.72}));
    let (pressure_alt_ft, temp_c) = wingtip_engine::gonogo::runways::field_air(900.0, Some(29.72), Some(30.0));
    let d = ask(
        "gonogo_end_distance",
        json!({"table": c172()["takeoff"], "runway": {"surface": "TURF", "length_ft": 3000},
                                               "pressure_alt_ft": pressure_alt_ft, "temp_c": temp_c, "weight_lb": 2550,
                                               "headwind_kt": 10}),
    );
    assert_eq!(num(&f["needed_ft"]), num(&d["total_ft"]).round());
    // No weight known: the table's heaviest, the longest distance.
    let heaviest = fit(3000.0, "TURF", Value::Null, json!({"weight_lb": null}));
    let d = ask(
        "gonogo_end_distance",
        json!({"table": c172()["takeoff"], "runway": {"surface": "TURF"}, "pressure_alt_ft": 900,
                                               "temp_c": 15, "weight_lb": null, "headwind_kt": 0}),
    );
    assert_eq!(num(&heaviest["needed_ft"]), num(&d["total_ft"]));
    // No tables: nothing needed, and no demonstrated crosswind: never over.
    let none = fit(3000.0, "ASP", json!({"dir_true_deg": 360, "speed_kt": 30}), json!({"aircraft": {"crosswind": null}}));
    assert_eq!((none["needed_ft"].clone(), none["crosswind_over"].clone()), (Value::Null, json!(false)));
    assert_eq!(wingtip_engine::runway::performance::DISTANCE_MARGIN, 1.15);
}

// --- the traffic pattern's legs (trafficPattern.test.ts, test_pattern.py) ---

/// A runway 09/27 a mile long on the equator: 09 lands east, 27 west.
pub(super) fn equator() -> Value {
    json!({"length_ft": 6076, "runway_ends": [
        {"ident": "09", "heading_true_deg": 90, "traffic": "left", "lat": 0, "lon": 0},
        {"ident": "27", "heading_true_deg": 270, "traffic": "right", "lat": 0, "lon": 1.0 / 60.0},
    ]})
}

pub(super) fn pt(v: &Value) -> (f64, f64) {
    (num(&v["lat"]), num(&v["lon"]))
}

pub(super) fn bearing(a: (f64, f64), b: (f64, f64)) -> f64 {
    wingtip_engine::geo::bearing_deg(a.0, a.1, b.0, b.1)
}

pub(super) fn leg<'a>(p: &'a Value, name: &str) -> &'a Value {
    p["legs"].as_array().unwrap().iter().find(|l| l["name"] == name).unwrap()
}

#[test]
fn a_pattern_is_flown_on_its_ends_side_its_downwind_three_quarters_of_a_mile_out() {
    let left = ask("traffic_pattern", json!({"ident": "KTST", "runway": equator(), "end_ident": "09", "altitude_ft": 1800}));
    let down = leg(&left, "Downwind");
    assert!(num(&down["from"]["lat"]) > 0.0);
    assert_eq!(bearing(pt(&down["from"]), pt(&down["to"])).round(), 270.0);
    let right = ask("traffic_pattern", json!({"ident": "KTST", "runway": equator(), "end_ident": "27", "altitude_ft": 1800}));
    assert!(num(&leg(&right, "Downwind")["from"]["lat"]) > 0.0);
    assert!(near(wingtip_engine::geo::distance_nm(0.0, 0.0, num(&down["to"]["lat"]), 0.0), circuit::DOWNWIND_NM, 0.005));
    let base = leg(&left, "Base");
    assert!(near(wingtip_engine::geo::distance_nm(0.0, 0.0, 0.0, num(&base["from"]["lon"])), circuit::DOWNWIND_NM, 0.005));
    assert!(num(&base["from"]["lon"]) < 0.0);
    let names: Vec<&str> = left["legs"].as_array().unwrap().iter().map(|l| l["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Upwind", "Crosswind", "Downwind", "Base", "Final"]);
    assert_eq!(left["legs"][4]["to"], json!({"lat": 0.0, "lon": 0.0}));
    assert_eq!(
        (left["kind"].clone(), left["runway"].clone(), left["traffic"].clone(), left["altitude_ft"].clone()),
        (json!("arrival"), json!("9"), json!("left"), json!(1800.0))
    );
}

#[test]
fn a_pattern_is_joined_on_the_45_abeam_midfield_and_not_drawn_without_a_threshold() {
    let p = ask("traffic_pattern", json!({"ident": "KTST", "runway": equator(), "end_ident": "09", "altitude_ft": 1800}));
    assert!(near(num(&p["entry"]["to"]["lon"]), 1.0 / 120.0, 0.0005));
    assert_eq!(bearing(pt(&p["entry"]["from"]), pt(&p["entry"]["to"])).round(), 225.0);
    assert!(num(&p["entry"]["from"]["lat"]) > num(&p["entry"]["to"]["lat"]));
    assert_eq!(p["entry"]["name"], json!("45° entry"));
    let mut unsurveyed = equator();
    for e in unsurveyed["runway_ends"].as_array_mut().unwrap() {
        e["lat"] = Value::Null;
        e["lon"] = Value::Null;
    }
    assert_eq!(ask("traffic_pattern", json!({"ident": "KTST", "runway": unsurveyed, "end_ident": "09"})), Value::Null);
    assert_eq!(ask("arrival_circuit", json!({"runway": unsurveyed, "end_ident": "09"})), Value::Null);
}

#[test]
fn the_way_out_is_straight_or_a_45_to_the_patterns_side_whichever_is_nearer_the_way_on() {
    let dep = |toward: Value| {
        ask("departure_pattern", json!({"ident": "KTST", "runway": equator(), "end_ident": "09", "altitude_ft": 1800, "toward": toward}))
    };
    let ahead = dep(json!({"lat": 0, "lon": 2}));
    assert_eq!(ahead["kind"], json!("departure"));
    assert_eq!(ahead["legs"].as_array().unwrap().len(), 1);
    assert_eq!(ahead["legs"][0]["from"], json!({"lat": 0.0, "lon": 0.0}));
    assert!(num(&ahead["legs"][0]["to"]["lon"]) > 1.0 / 60.0);
    assert_eq!(ahead["entry"]["name"], json!("Straight out"));
    assert_eq!(bearing(pt(&ahead["entry"]["from"]), pt(&ahead["entry"]["to"])).round(), 90.0);
    let north = dep(json!({"lat": 1, "lon": 0.5}));
    assert_eq!(north["entry"]["name"], json!("45° departure"));
    assert_eq!(bearing(pt(&north["entry"]["from"]), pt(&north["entry"]["to"])).round(), 45.0);
}

/// UGN's runway 5/23 as wingtip.pattern with_traffic gives it: 23 right, 5 left.
pub(super) fn ugn() -> Value {
    json!({"runway_ends": [
        {"ident": "05", "heading_true_deg": 49.0, "traffic": "left", "lat": 42.4176, "lon": -87.8742},
        {"ident": "23", "heading_true_deg": 229.0, "traffic": "right", "lat": 42.4268, "lon": -87.8593},
    ]})
}

pub(super) fn side_of(end: (f64, f64), along: f64, p: (f64, f64)) -> f64 {
    circuit::signed_turn(along, bearing(end, p))
}

#[test]
fn the_planners_arrival_comes_in_at_45_to_the_downwind_and_lands_on_the_threshold() {
    // test_pattern.py: "5" finds NASR's "05".
    let points: Vec<(f64, f64)> = ask("arrival_circuit", json!({"runway": ugn(), "end_ident": "5"}))["points"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (num(&p[0]), num(&p[1])))
        .collect();
    let [entry, midfield, downwind_end, _final_start, threshold] = points[..] else { panic!("{points:?}") };
    assert_eq!(threshold, (42.4176, -87.8742));
    let along = bearing((42.4176, -87.8742), (42.4268, -87.8593));
    assert!(side_of(threshold, along, midfield) < 0.0);
    let turn = circuit::signed_turn(bearing(midfield, downwind_end), bearing(entry, midfield)).abs();
    assert!(near(turn, 45.0, 1.0), "{turn}");
    let right: Vec<Value> = ask("arrival_circuit", json!({"runway": ugn(), "end_ident": "23"}))["points"].as_array().unwrap().clone();
    let back = bearing((42.4268, -87.8593), (42.4176, -87.8742));
    assert!(side_of((num(&right[4][0]), num(&right[4][1])), back, (num(&right[1][0]), num(&right[1][1]))) > 0.0);
}

#[test]
fn the_planners_departure_leaves_straight_out_or_at_45_toward_the_way_on() {
    let along = bearing((42.4176, -87.8742), (42.4268, -87.8593));
    let ahead = wingtip_engine::geo::destination(42.4268, -87.8593, along, 30.0);
    let left = wingtip_engine::geo::destination(42.4268, -87.8593, (along - 60.0).rem_euclid(360.0), 30.0);
    let straight = ask("departure_circuit", json!({"runway": ugn(), "end_ident": "5", "toward": [ahead.0, ahead.1]}));
    let turned = ask("departure_circuit", json!({"runway": ugn(), "end_ident": "5", "toward": [left.0, left.1]}));
    assert_eq!(straight["points"][0], json!([42.4176, -87.8742]));
    assert_eq!(straight["points"].as_array().unwrap().len(), 4);
    assert!(near(num(&straight["exit_deg"]), along, 0.2));
    assert!(near(num(&turned["exit_deg"]), (along - 45.0).rem_euclid(360.0), 0.2));
    let none = json!({"runway_ends": [{"ident": "14", "heading_true_deg": 140.0, "traffic": "left", "lat": null, "lon": null}]});
    assert_eq!(ask("departure_circuit", json!({"runway": none, "end_ident": "14", "toward": [42.0, -88.0]})), Value::Null);
}

#[test]
fn a_rule_not_known_or_input_not_of_its_shape_is_an_error_not_a_panic() {
    assert!(call("wind_components", "{}").is_err());
    assert!(call("runway_with_winds", r#"{"runways": [{"end_headings": [[1, 2]]}], "variation_deg": 0}"#).is_err());
    assert!(call("departure_circuit", r#"{"runway": {}, "end_ident": "9", "toward": [1]}"#).is_err());
    assert!(call("runway_end_fit", r#"{"runway": {}, "elevation_ft": 0}"#).is_err());
}

#[test]
fn a_fit_with_no_elevation_or_no_length_is_unknown_and_one_past_the_table_beyond() {
    // 14 CFR 91.103(b): no elevation, no distance -- not a sea-level one.
    let f = fit(5000.0, "ASP", json!(null), json!({"elevation_ft": null}));
    assert_eq!((f["needed_ft"].clone(), f["unknown"].clone(), f["short"].clone()), (json!(null), json!(true), json!(false)));
    let f = fit(5000.0, "ASP", json!(null), json!({"runway": {"length_ft": null, "surface": "ASP", "closed": false, "runway_ends": []}}));
    assert_eq!((f["unknown"].clone(), f["short"].clone(), f["close"].clone()), (json!(true), json!(false), json!(false)));
    let f = fit(5000.0, "ASP", json!(null), json!({}));
    assert_eq!((f["unknown"].clone(), f["beyond"].clone()), (json!(false), json!(false)));
    // Heavier than the 172's heaviest table, 2,550 lb.
    assert_eq!(fit(5000.0, "ASP", json!(null), json!({"weight_lb": 2600}))["beyond"], json!(true));
}
