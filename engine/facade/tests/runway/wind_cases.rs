use super::*;

// --- wind (wind.test.ts) ----------------------------------------------------

#[test]
fn a_wind_splits_along_and_across_a_tailwind_negative_and_a_crosswind_from_the_right_positive() {
    // 300° at 20 kt on runway 27 (270° true): 30° off, 17.3 along, 10 across.
    let c = ask("wind_components", json!({"from_deg": 300, "kt": 20, "heading_deg": 270}));
    assert!(near(num(&c["headwind_kt"]), 17.32, 0.005));
    assert!(near(num(&c["crosswind_kt"]), 10.0, 1e-6));
    assert!(near(wind::crosswind_kt(240.0, 20.0, 270.0), -10.0, 1e-6));
    assert!(near(wind::headwind_kt(90.0, 12.0, 270.0), -12.0, 1e-6));
    // Across the 360/0 seam: 010° on 350° is 20° from the right.
    assert!(near(wind::crosswind_kt(10.0, 10.0, 350.0), 3.42, 0.005));
}

#[test]
fn a_crosswind_is_judged_by_the_steady_one_or_the_gusts_whichever_is_more() {
    assert_eq!(ask("wind_steady_or_gust", json!({"steady_kt": -6, "gust_kt": 9})), json!(9.0));
    assert_eq!(ask("wind_steady_or_gust", json!({"steady_kt": 12, "gust_kt": null})), json!(12.0));
    assert_eq!(ask("wind_steady_or_gust", json!({"steady_kt": -12, "gust_kt": -8})), json!(12.0));
    assert_eq!(ask("runway_crosswind", json!({"wind": {"crosswind_kt": -4, "gust_crosswind_kt": -11}})), json!(11.0));
}

#[test]
fn calm_is_a_speed_of_nothing_and_a_wind_not_reported_is_not_calm() {
    assert_eq!(ask("wind_calm", json!({"speed_kt": 0})), json!(true));
    assert_eq!(ask("wind_calm", json!({"speed_kt": 3})), json!(false));
    assert_eq!(ask("wind_calm", json!({"speed_kt": null})), json!(false));
    assert_eq!(ask("wind_calm", json!({})), json!(false));
    let calm = |w: Value| ask("runway_calm", json!({"wind": w}));
    assert_eq!(calm(json!({"end": "18", "headwind_kt": 0, "crosswind_kt": 0, "gust_crosswind_kt": null})), json!(true));
    // 1 kt straight across: not calm.
    assert_eq!(calm(json!({"end": "18", "headwind_kt": 0, "crosswind_kt": 1, "gust_crosswind_kt": null})), json!(false));
}

// --- the favoured end (test_runway_wind.py) -------------------------------

pub(super) fn nine_27() -> Value {
    json!([["9", 88.0], ["27", 268.0]])
}

pub(super) fn favoured(ends: Value, metar: Value, variation: f64, recent: Value) -> Value {
    // One runway through runway_with_winds: the end its wind favours.
    ask("runway_with_winds", json!({"runways": [{"end_headings": ends}], "metar": metar, "variation_deg": variation, "recent": recent}))[0]
        .clone()
}

#[test]
fn the_end_into_the_wind_is_favoured_its_crosswind_signed_and_rounded_as_the_planner_rounds() {
    // 300 at 12 on 27 (268 true): 32 degrees off the nose, from the right.
    let w = favoured(nine_27(), json!({"wind_dir_true_deg": 300.0, "wind_speed_kt": 12.0}), -3.0, Value::Null);
    assert!(near(num(&w["crosswind_exact_kt"]), 12.0 * 32f64.to_radians().sin(), 1e-9) && w["crosswind_kt"] == json!(6));
    // Whole numbers, as the planner's Python gives them.
    let raw = call(
        "runway_with_winds",
        &json!({"runways": [{"end_headings": nine_27()}], "metar": {"wind_dir_true_deg": 300.0, "wind_speed_kt": 12.0},
                                                 "variation_deg": 0.0})
        .to_string(),
    )
    .unwrap();
    assert!(raw.contains("\"headwind_kt\":10,"), "{raw}");
    // 040 on 9 (088 true): from the left, and the gust its own.
    let w = favoured(nine_27(), json!({"wind_dir_true_deg": 40.0, "wind_speed_kt": 10.0, "wind_gust_kt": 20.0}), 0.0, Value::Null);
    assert_eq!((w["end"].as_str(), num(&w["crosswind_kt"]), num(&w["gust_crosswind_kt"])), (Some("9"), -7.0, -15.0));
}

#[test]
fn an_end_with_no_heading_takes_its_number_turned_true() {
    // Runway 18 at 3 degrees west: 177 true; a wind from 177 is all headwind.
    assert!(near(num(&ask("runway_end_heading", json!({"ident": "18L", "heading_true_deg": null, "variation_deg": -3.0}))), 177.0, 1e-9));
    assert_eq!(ask("runway_end_heading", json!({"ident": "H1", "variation_deg": 0.0})), Value::Null);
    assert_eq!(ask("runway_end_heading", json!({"ident": "09", "heading_true_deg": 361.5, "variation_deg": 0.0})), json!(1.5));
    let w = favoured(json!([["18L", null], ["36R", null]]), json!({"wind_dir_true_deg": 177.0, "wind_speed_kt": 8.0}), -3.0, Value::Null);
    assert_eq!(w, json!({"end": "18L", "headwind_kt": 8, "crosswind_kt": 0, "gust_crosswind_kt": null, "crosswind_exact_kt": 0.0}));
}

#[test]
fn no_wind_without_a_report_a_direction_or_a_runway_heading() {
    assert_eq!(favoured(nine_27(), Value::Null, 0.0, Value::Null), Value::Null);
    assert_eq!(favoured(nine_27(), json!({}), 0.0, Value::Null), Value::Null);
    assert_eq!(favoured(nine_27(), json!({"wind_dir_true_deg": null, "wind_speed_kt": 4.0}), 0.0, Value::Null), Value::Null);
    assert_eq!(favoured(json!([["H1", null]]), json!({"wind_dir_true_deg": 300.0, "wind_speed_kt": 12.0}), 0.0, Value::Null), Value::Null);
}

#[test]
fn calm_is_nothing_on_the_first_end_or_on_the_one_the_last_wind_favoured() {
    let calm = json!({"wind_dir_true_deg": 0.0, "wind_speed_kt": 0.0});
    let raw =
        call("runway_with_winds", &json!({"runways": [{"end_headings": nine_27()}], "metar": calm, "variation_deg": 0.0}).to_string())
            .unwrap();
    assert_eq!(raw, r#"[{"end":"9","headwind_kt":0.0,"crosswind_kt":0.0,"gust_crosswind_kt":null}]"#);
    let w = favoured(nine_27(), calm.clone(), 0.0, json!({"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0}));
    assert_eq!(w, json!({"end": "27", "headwind_kt": 0.0, "crosswind_kt": 0.0, "gust_crosswind_kt": null, "in_use": true}));
    // with_winds: the one runway the last wind favoured is in use.
    let runways = json!([{"end_headings": [["6", 58.0], ["24", 238.0]]}, {"end_headings": [["9", 88.0], ["27", 268.0]]}]);
    let out = ask(
        "runway_with_winds",
        json!({"runways": runways, "metar": calm, "variation_deg": -3.0,
                                               "recent": {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0}}),
    );
    assert_eq!(out[0].get("in_use"), None);
    assert_eq!(out[1]["in_use"], json!(true));
    assert_eq!(out[1]["end"], json!("27"));
}

// --- the runway in use and the pilot's pick (runwayFlown.test.ts, test_runway_wind_in_use.py)

pub(super) fn field() -> Value {
    json!([
        runway(
            &[("09", 90.0), ("27", 270.0)],
            6000.0,
            json!({"end": "27", "headwind_kt": 12, "crosswind_kt": 1, "gust_crosswind_kt": null})
        ),
        runway(
            &[("18", 180.0), ("36", 360.0)],
            2400.0,
            json!({"end": "36", "headwind_kt": 0, "crosswind_kt": -12, "gust_crosswind_kt": null})
        ),
    ])
}

pub(super) fn flown(runways: &Value, picked: Value) -> Option<(usize, String)> {
    let f = ask("gonogo_runway_flown", json!({"runways": runways, "picked": picked}));
    if f.is_null() {
        return None;
    }
    let (r, e) = (f["runway"].as_u64().unwrap() as usize, f["end"].as_u64().unwrap() as usize);
    Some((r, runways[r]["runway_ends"][e]["ident"].as_str().unwrap().to_owned()))
}

#[test]
fn the_runway_flown_is_the_pilots_pick_else_the_one_most_nearly_into_the_wind() {
    let f = field();
    assert_eq!(flown(&f, json!("36")), Some((1, "36".into())));
    assert_eq!(flown(&f, Value::Null), Some((0, "27".into())));
    assert_eq!(flown(&f, json!("NONE")), Some((0, "27".into())));
    // A pick on a closed runway, or one the field doesn't have, falls back.
    let mut closed = f.clone();
    closed[1]["closed"] = json!(true);
    closed[1]["wind"] = Value::Null;
    assert_eq!(flown(&closed, json!("36")), Some((0, "27".into())));
    assert_eq!(flown(&f, json!("4")), Some((0, "27".into())));
}

#[test]
fn a_pick_is_found_by_the_fields_icao_or_faa_ident_alike() {
    let picks = json!({"pattern": [["C81", "24"], ["UES", "10"], ["KDLH", "NONE"]], "takeoff": [["UES", "28"]]});
    let picked = |ident: &str, kind: &str, departure: bool| {
        ask("gonogo_picked_end", json!({"picks": picks, "ident": ident, "kind": kind, "departure": departure}))
    };
    assert_eq!(picked("C81", "takeoff", true), json!("24"));
    assert_eq!(picked("UES", "landing", false), json!("10"));
    assert_eq!(picked("UES", "takeoff", false), json!("28"));
    assert_eq!(picked("KUES", "landing", false), json!("10"));
    assert_eq!(picked("KDLH", "landing", false), Value::Null);
    assert_eq!(picked("KMSN", "landing", false), Value::Null);
}

#[test]
fn calm_the_runway_in_use_then_the_paved_then_the_longer() {
    let kept = json!([
        runway(&[("06", 58.0), ("24", 238.0)], 3573.0, json!({"end": "06", "headwind_kt": 0, "crosswind_kt": 0})),
        runway(&[("09", 88.0), ("27", 268.0)], 3270.0, json!({"end": "27", "headwind_kt": 0, "crosswind_kt": 0, "in_use": true})),
    ]);
    assert_eq!(flown(&kept, Value::Null).unwrap().1, "27");
    let mut calm = json!([
        runway(&[("06", 58.0), ("24", 238.0)], 3573.0, json!({"end": "06", "headwind_kt": 0, "crosswind_kt": 0})),
        runway(&[("09", 88.0), ("27", 268.0)], 3270.0, json!({"end": "09", "headwind_kt": 0, "crosswind_kt": 0})),
    ]);
    calm[0]["surface"] = json!("COP");
    assert_eq!(flown(&calm, Value::Null).unwrap().1, "09");
    // A helipad is not one.
    let pad = json!([runway(&[("H1", f64::NAN)], 50.0, json!({"end": "H1", "headwind_kt": 5, "crosswind_kt": 0}))]);
    let mut pad = pad;
    pad[0]["runway_ends"][0]["heading_true_deg"] = Value::Null;
    assert_eq!(flown(&pad, Value::Null), None);
}
