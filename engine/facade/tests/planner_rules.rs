//! The planner's rules moved into the engine (#482 phase 0), held to the
//! answers the planner's own Python gave before the move
//! (apps/web/src/lib/fixtures/plannerRules.json, written by it): the airspace
//! over a point, the Mode C veil, an FNS message's NOTAMs, a hazard's
//! window, a report's ceiling and category, and a figure in the web's
//! words. The planner now asks these names (wingtip_native.call), so the
//! same cases hold the web, the phones and the planner to one answer.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/plannerRules.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// Two JSON values the same, a number by its value: Python wrote 800 where
/// the engine writes 800.0.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap()
}

fn check(section: &str, name: &str, input: impl Fn(&Value) -> Value, answer: &str) {
    let all = fixture();
    let cases = all[section].as_array().unwrap_or_else(|| panic!("no {section}"));
    assert!(!cases.is_empty(), "{section} has no cases");
    for case in cases {
        let got = ask(name, input(case));
        assert!(same(&got, &case[answer]), "{section}: {case}\ngot {got}");
    }
}

#[test]
fn the_airspace_over_a_point() {
    check(
        "airspaceColumn",
        "airspace_column",
        |c| json!({ "ground_ft": c["ground_ft"], "volumes": c["volumes"], "in_veil": c["in_veil"] }),
        "bands",
    );
    check("modeCVeil", "mode_c_veil", |c| json!({ "lat": c["lat"], "lon": c["lon"], "airports": c["airports"] }), "veil");
}

#[test]
fn an_fns_messages_notams() {
    check("notamsFns", "notams_fns", |c| json!({ "text": c["text"] }), "notams");
}

#[test]
fn a_hazards_window() {
    check(
        "hazardWindow",
        "gonogo_hazard_window",
        |c| json!({ "enter": c["enter"], "leave": c["leave"], "valid_from": c["valid_from"], "valid_to": c["valid_to"], "margin_min": c["margin_min"] }),
        "when",
    );
}

#[test]
fn a_reports_ceiling_and_category() {
    check("ceiling", "ceiling_ft", |c| json!({ "layers": c["layers"], "vert_vis_ft": c["vert_vis_ft"] }), "ceiling_ft");
}

/// The AWC's data API sends a layer whose height a station could not
/// measure ("OVC///", "VV///") with no base: the ceiling is not known, not
/// absent (14 CFR 1.1), and so neither is the category but for what the
/// visibility settles. One with no height above a measured ceiling leaves
/// it known (layers come lowest first, FMH-1 ch. 9).
#[test]
fn a_ceiling_sent_with_no_height() {
    assert_eq!(ask("ceiling_ft", json!({ "layers": [{ "cover": "BKN", "base_ft": null }] })), Value::Null);
    // Under a measured layer, a layer with no height is above it.
    assert_eq!(
        ask("ceiling_ft", json!({ "layers": [{ "cover": "BKN", "base_ft": 1200 }, { "cover": "OVC", "base_ft": null }] })),
        json!(1200.0)
    );
    // A vertical visibility is the obscuration from the surface, under all.
    assert_eq!(ask("ceiling_ft", json!({ "layers": [{ "cover": "OVX", "base_ft": null }], "vert_vis_ft": 200 })), json!(200.0));
    // A missing visibility settles only a ceiling under 500 ft (AIM 7-1-7).
    for (ceiling, want) in [(json!(5000), Value::Null), (json!(2000), Value::Null), (json!(400), json!("LIFR"))] {
        assert_eq!(ask("flight_category", json!({ "ceiling_ft": ceiling, "visibility_sm": null })), want);
    }
}

#[test]
fn a_figure_in_the_webs_words() {
    let all = fixture();
    for c in all["words"].as_array().unwrap() {
        let n = &c["n"];
        let mut want = vec![("words_num", json!({ "n": n }), &c["num"]), ("words_alt_ft", json!({ "ft": n }), &c["alt_ft"])];
        if !n.is_null() {
            want.extend([
                ("words_one", json!({ "n": n }), &c["one"]),
                ("words_to_fixed", json!({ "n": n }), &c["to_fixed"]),
                ("words_to_fixed", json!({ "n": n, "digits": 0 }), &c["to_fixed0"]),
                ("words_to_fixed", json!({ "n": n, "digits": 2 }), &c["to_fixed2"]),
                ("words_grouped", json!({ "n": n }), &c["grouped"]),
                ("words_flight_level", json!({ "ft": n }), &c["flight_level"]),
            ]);
        }
        for (name, input, expected) in want {
            let got = ask(name, input.clone());
            assert!(same(&got, expected), "{name} {input}: got {got}, want {expected}");
        }
    }
}

/// Two answers the same to a part in 10^9: the fixture's straight line is
/// pyproj's WGS-84 geodesic, the engine's geographiclib-rs's, the same
/// algorithm (Karney 2013) by another hand.
fn close(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            (x - y).abs() <= 1e-9 * x.abs().max(y.abs()).max(1.0)
        }
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| close(v, w))),
        _ => a == b,
    }
}

#[test]
fn a_flights_fuel_stop_figures() {
    // The planner's routers.plan worst_burn_per_nm and fuel_stops_of's
    // arithmetic before the move: the worst stretch's burn, the detour,
    // and 91.151(a)(2)'s night reserve where the trip runs into the dark.
    let all = fixture();
    for c in all["worstBurnPerNm"].as_array().unwrap() {
        let legs = c["legs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| (l["distance_nm"].as_f64().unwrap_or(0.0), l["fuel_gal"].as_f64()))
            .collect::<Vec<_>>();
        let got = wingtip_engine::navlog::fuel_stop::worst_burn_per_nm(&legs, c["over_nm"].as_f64().unwrap());
        let want = c["worst"].as_f64();
        assert!(got.zip(want).map_or(got.is_none() && want.is_none(), |(g, w)| (g - w).abs() < 1e-12), "{c}: got {got:?}");
    }
    let cases = all["fuelStopNeed"].as_array().unwrap();
    assert!(cases.iter().any(|c| c["need"].is_null()) && cases.iter().any(|c| !c["need"].is_null()));
    for c in cases {
        let input = json!({ "totals": c["totals"], "legs": c["legs"], "start": c["start"], "end": c["end"], "depart_s": c["depart_s"] });
        let got = ask("navlog_fuel_stop_need", input);
        assert!(close(&got, &c["need"]), "{c}\ngot {got}");
    }
}

#[test]
fn the_pattern_altitude_flown_to_the_hundred_feet() {
    let all = fixture();
    for c in all["patternFlown"].as_array().unwrap() {
        let got = ask("pattern_altitude", json!({ "elevation_ft": c["elevation_ft"], "published_agl_ft": c["published_agl_ft"] }));
        assert!(same(&got["flown_ft"], &c["flown_ft"]), "{c}: got {got}");
    }
}
