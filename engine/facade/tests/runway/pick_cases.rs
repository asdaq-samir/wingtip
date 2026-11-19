use super::*;

// --- windPick (windPick.test.ts, test_runway_wind_in_use.py) --------------

pub(super) fn pick_of(runways: Value, nearby: Value, forecast_at: Value) -> Value {
    ask("wind_pick", json!({"runways": runways, "nearby": nearby, "forecast_at": forecast_at}))
}

#[test]
fn a_fields_own_report_as_the_planner_worked_it_out_on_each_runway() {
    let p = pick_of(kdlh(), json!({"station": "KDLH", "distance_nm": 0, "dir_true_deg": 0, "speed_kt": 30}), Value::Null);
    assert_eq!(p, json!({"ident": "21", "headwind_kt": 7.0, "crosswind_kt": -1.0, "gust_crosswind_kt": null, "calm": false, "from": null}));
}

#[test]
fn a_field_with_no_report_goes_by_the_nearest_reports_wind_said_as_that_stations() {
    // KUGN's 220° at 8 kt: 18° off 24, 48° off 27.
    let p = pick_of(c81(), json!({"station": "KUGN", "distance_nm": 11.1, "dir_true_deg": 220, "speed_kt": 8, "gust_kt": 15}), Value::Null);
    let r = |x: f64| x.round();
    assert_eq!(
        p,
        json!({
            "ident": "24", "headwind_kt": r(8.0 * 18f64.to_radians().cos()), "crosswind_kt": r(8.0 * (-18f64).to_radians().sin()),
            "gust_crosswind_kt": r(15.0 * (-18f64).to_radians().sin()), "calm": false, "from": {"ident": "KUGN", "nm": 11.0},
        })
    );
}

#[test]
fn calm_and_a_variable_wind_pick_the_runway_in_use_or_the_most_used_and_no_wind_picks_none() {
    let p = pick_of(c81(), json!({"station": "KUGN", "distance_nm": 11, "dir_true_deg": null, "speed_kt": 0}), Value::Null);
    assert_eq!((p["ident"].clone(), p["calm"].clone(), p["from"]["ident"].clone()), (json!("6"), json!(true), json!("KUGN")));
    let kept = json!([
        runway(
            &[("06", 58.0), ("24", 238.0)],
            3573.0,
            json!({"end": "06", "headwind_kt": 0, "crosswind_kt": 0, "gust_crosswind_kt": null})
        ),
        runway(
            &[("09", 88.0), ("27", 268.0)],
            3270.0,
            json!({"end": "27", "headwind_kt": 0, "crosswind_kt": 0, "gust_crosswind_kt": null, "in_use": true})
        ),
    ]);
    let p = pick_of(kept, Value::Null, Value::Null);
    assert_eq!((p["ident"].clone(), p["calm"].clone(), p["in_use"].clone()), (json!("27"), json!(true), json!(true)));
    // The paved runway, though a strip of another surface is listed longer.
    let mut paved = c81();
    paved[0]["surface"] = json!("COP");
    assert_eq!(pick_of(paved, json!({"station": "KUGN", "distance_nm": 11, "speed_kt": 0}), Value::Null)["ident"], json!("9"));
    let p = pick_of(c81(), json!({"station": "KUGN", "distance_nm": 11, "dir_true_deg": null, "speed_kt": 6}), Value::Null);
    assert_eq!((p["ident"].clone(), p["calm"].clone(), p["variable_kt"].clone()), (json!("6"), json!(true), json!(6.0)));
    assert_eq!(pick_of(c81(), Value::Null, Value::Null), Value::Null);
    assert_eq!(
        pick_of(c81(), json!({"station": "KRFD", "distance_nm": 2, "dir_true_deg": 90, "speed_kt": null}), Value::Null),
        Value::Null
    );
}

#[test]
fn a_forecasts_wind_is_picked_into_on_its_own_the_report_now_set_aside() {
    let at = 1_790_000_000.0;
    let p = pick_of(kdlh(), json!({"station": "KDLH", "distance_nm": 0, "dir_true_deg": 90, "speed_kt": 12}), json!(at));
    assert_eq!(
        (p["ident"].clone(), num(&p["headwind_kt"]), p["from"].clone(), num(&p["forecast_at"])),
        (json!("9"), 12.0, Value::Null, at)
    );
    let p = pick_of(c81(), json!({"station": "KRFD", "distance_nm": 21.4, "dir_true_deg": 270, "speed_kt": 10}), json!(at));
    assert_eq!((p["ident"].clone(), p["from"].clone()), (json!("27"), json!({"ident": "KRFD", "nm": 21.0})));
}

#[test]
fn ends_square_across_the_wind_are_a_tie_the_longer_runway_taking_it() {
    // A wind from 360 straight across 09/27 and its parallel: the sums leave
    // a tailwind of a few 1e-16 on one end, which is no reason to pick it
    // over the longer runway (wingtip.runway_wind rounds them to 9 places).
    let runways =
        json!([runway(&[("09", 90.0), ("27", 270.0)], 3000.0, Value::Null), runway(&[("09", 90.0), ("27", 270.0)], 5000.0, Value::Null)]);
    let mut runways = runways;
    runways[1]["runway_ends"] = json!([{"ident": "27", "heading_true_deg": 270.0}, {"ident": "09", "heading_true_deg": 90.0}]);
    let p = pick_of(runways, json!({"station": "KX", "distance_nm": 3, "dir_true_deg": 0, "speed_kt": 10}), json!(0));
    assert_eq!(p["ident"], json!("27"));
}

// --- the pattern's words and altitude (pattern.ts, test_pattern.py) -------

#[test]
fn a_pattern_is_flown_left_unless_the_faa_says_right() {
    assert_eq!(num(&ask("pattern_side", json!({"heading_true_deg": 90, "traffic": "left"}))), 0.0);
    assert_eq!(num(&ask("pattern_side", json!({"heading_true_deg": 90, "traffic": "right"}))), 180.0);
    assert_eq!(num(&ask("pattern_side", json!({"heading_true_deg": 30}))), 300.0);
    assert_eq!(ask("compass_word", json!({"bearing_deg": 225})), json!("southwest"));
    assert_eq!(ask("compass_word", json!({"bearing_deg": -10})), json!("north"));
    assert_eq!(pick::runway_number("09"), "9");
    assert_eq!(ask("runway_end_key", json!({"ident": " 09l "})), json!("9L"));
    assert_eq!(ask("faa_ids", json!({"ident": "KRFD"})), json!(["RFD", "KRFD"]));
    assert_eq!(ask("faa_ids", json!({"ident": "C81"})), json!(["C81"]));
}

#[test]
fn a_pattern_is_joined_on_the_45_from_its_side_and_over_midfield_from_the_other() {
    // Left traffic on 27: the downwind is south of the runway.
    let end = json!({"ident": "27", "heading_true_deg": 270, "traffic": "left"});
    let e = ask("pattern_entry", json!({"end": end, "course_deg": 0}));
    assert_eq!(e["from"], json!("south"));
    assert_eq!(e["pattern_side"], json!(true));
    assert_eq!(
        e["words"],
        json!(
            "From the south, on the pattern's side: join the 45° to the left downwind for runway 27, abeam midfield at pattern altitude."
        )
    );
    let e = ask("pattern_entry", json!({"end": end, "course_deg": 180}));
    assert_eq!(e["pattern_side"], json!(false));
    assert!(e["words"].as_str().unwrap().contains("cross midfield at least 500 ft above pattern altitude, descend to it well clear"));
    assert_eq!(
        ask("pattern_exit", json!({"traffic": "right"})),
        json!("Straight out, or a 45° right turn once past the departure end at pattern altitude.")
    );
}

#[test]
fn the_pattern_altitude_is_the_faas_where_published_and_1000_ft_above_the_field_where_not() {
    assert_eq!(
        ask("pattern_altitude", json!({"elevation_ft": 742.0, "published_agl_ft": 800.0})),
        json!({"agl_ft": 800.0, "altitude_ft": 1542, "flown_ft": 1500, "published": true})
    );
    assert_eq!(
        ask("pattern_altitude", json!({"elevation_ft": 727.0})),
        json!({"agl_ft": 1000.0, "altitude_ft": 1700, "flown_ft": 1700, "published": false})
    );
    // The FAA's to the foot, halves up as the elevation is written (808.5 is 809); none, to the hundred.
    let at = |e: Value, a: Option<f64>| ask("pattern_altitude", json!({"elevation_ft": e, "published_agl_ft": a}))["altitude_ft"].take();
    assert_eq!((at(json!(808.5), Some(800.0)), at(json!(808.5), None), at(Value::Null, None)), (json!(1609), json!(1800), Value::Null));
}

#[test]
fn the_pattern_altitude_flown_is_to_the_nearest_hundred_feet_from_the_unrounded_sum() {
    // KOSH, 808 ft: 1,808 flown at 1,800; a field at 750 ft is 1,750, a
    // half, to the even 1,800; 1,749.6 stays 1,700 (not 1,750 then 1,800).
    assert_eq!(ask("pattern_altitude", json!({"elevation_ft": 808.0}))["flown_ft"], json!(1800));
    assert_eq!(ask("pattern_altitude", json!({"elevation_ft": 750.0}))["flown_ft"], json!(1800));
    assert_eq!(ask("pattern_altitude", json!({"elevation_ft": 650.0}))["flown_ft"], json!(1600));
    assert_eq!(ask("pattern_altitude", json!({"elevation_ft": 749.6}))["flown_ft"], json!(1700));
    assert_eq!(ask("pattern_altitude", json!({}))["flown_ft"], Value::Null);
}

#[test]
fn an_end_is_right_traffic_only_where_the_faa_flags_it() {
    let ends = ask(
        "runway_ends_traffic",
        json!({"end_headings": [["05", 50.0], ["23", null], ["H1", null]], "variation_deg": -3.0, "right": ["23"]}),
    );
    assert_eq!(ends[0], json!({"ident": "05", "heading_true_deg": 50.0, "traffic": "left"}));
    assert_eq!(ends[1]["traffic"], json!("right"));
    assert!(near(num(&ends[1]["heading_true_deg"]), 227.0, 1e-9));
    assert_eq!(ends[2]["heading_true_deg"], Value::Null);
}
