//! The emergency assistant's rules (brief's fields, radio's mayday,
//! pilot's checklist_section), held to the shared fixture
//! (apps/web/src/lib/fixtures/emergency.json) the web's lib/emergency
//! test reads too.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/emergency.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn idents(answer: &Value) -> Vec<String> {
    answer["fields"].as_array().unwrap().iter().map(|f| f["ident"].as_str().unwrap().to_owned()).collect()
}

#[test]
fn over_lake_geneva_the_fields_within_a_glide_come_first() {
    let case = &fixture()["lakeGeneva"];
    let answer = ask("best_fields", &case["input"]);
    assert_eq!(json!(idents(&answer)), case["order"]);
    let reach: Vec<&Value> = answer["fields"].as_array().unwrap().iter().map(|f| &f["reach"]).collect();
    assert_eq!(json!(reach), case["reach"]);
    // 3,665 ft over C02 (the nearest field) at 9 to 1: 5.4 nm in still air.
    let glide = &answer["glide"];
    assert_eq!(glide["still_air_nm"], json!(5.4));
    assert_eq!(glide["ring"].as_array().unwrap().len(), 36);
    // The wind from the west carries the glide further east than west.
    let ring = glide["ring"].as_array().unwrap();
    let east = ring[9][1].as_f64().unwrap() - (-88.4334);
    let west = -88.4334 - ring[27][1].as_f64().unwrap();
    assert!(east > west, "east {east} west {west}");
    let c02 = &answer["fields"][0];
    assert!(c02["arrive_agl_ft"].as_f64().unwrap() > 1000.0);
    // No METAR at C02: the end most nearly straight in from the course.
    assert_eq!(c02["runway"]["end"], json!("05"));
    assert!(answer["fields"][1]["reasons"].as_array().unwrap().iter().any(|r| r["text"].as_str().unwrap().starts_with("Private field")));
}

/// A field NASR lists as closed (ARPT_STATUS CI or CP, or any code but O)
/// is never ranked as a landing site, a glide's or a diversion's (decision
/// 0043); one with no status (no NASR record) or O is ranked as before.
#[test]
fn a_closed_field_is_never_a_landing_site() {
    let case = &fixture()["lakeGeneva"];
    let first = case["order"][0].as_str().unwrap().to_owned();
    for code in ["CI", "CP", ""] {
        for mode in ["glide", "diversion"] {
            let mut input = case["input"].clone();
            input["mode"] = json!(mode);
            for f in input["fields"].as_array_mut().unwrap() {
                if f["ident"] == json!(first) {
                    f["status"] = json!(code);
                }
            }
            let answer = ask("best_fields", &input);
            assert!(!idents(&answer).contains(&first), "{code} {mode}: {:?}", idents(&answer));
            assert!(!idents(&answer).is_empty());
        }
    }
    let mut open = case["input"].clone();
    for f in open["fields"].as_array_mut().unwrap() {
        f["status"] = json!("O");
    }
    assert_eq!(json!(idents(&ask("best_fields", &open))), case["order"]);
}

#[test]
fn with_no_airplane_the_glide_is_not_guessed() {
    let case = &fixture()["lakeGeneva"];
    let mut input = case["input"].clone();
    input["airplane"] = Value::Null;
    let answer = ask("best_fields", &input);
    assert_eq!(answer["needs_airplane"], json!(true));
    assert_eq!(answer["glide"], Value::Null);
    assert_eq!(json!(idents(&answer)), case["noAirplane"]);
    assert!(answer["fields"].as_array().unwrap().iter().all(|f| f["reach"] == json!("unknown")));
}

#[test]
fn a_glide_ratio_with_no_best_glide_speed_reaches_only_in_still_air() {
    // A pilot's own airplane given its glide ratio alone: in still air its
    // reach is the ratio's (3,665 ft at 9 to 1 is 5.4 nm, as with the
    // book's speed); with a wind aloft a headwind's loss needs the glide's
    // airspeed, so no reach is worked rather than one too far.
    let case = &fixture()["lakeGeneva"];
    let mut calm = case["input"].clone();
    calm["airplane"]["glide"]["best_glide_kias"] = Value::Null;
    calm["wind"] = Value::Null;
    let answer = ask("best_fields", &calm);
    assert_eq!(answer["glide"]["still_air_nm"], json!(5.4));
    assert_eq!(answer["glide"]["tas_kt"], Value::Null);
    assert_eq!(answer["needs_airplane"], json!(false));
    let mut windy = case["input"].clone();
    windy["airplane"]["glide"]["best_glide_kias"] = Value::Null;
    let answer = ask("best_fields", &windy);
    assert_eq!(answer["glide"], Value::Null);
    assert!(answer["fields"].as_array().unwrap().iter().all(|f| f["reach"] == json!("unknown")));
}

#[test]
fn a_diversion_weighs_the_runway_and_the_weather_not_the_glide() {
    let case = &fixture()["lakeGeneva"];
    let mut input = case["input"].clone();
    input["mode"] = json!("diversion");
    input["airplane"]["cruise_tas_kt"] = json!(110);
    input["fields"][3]["metar"]["flight_category"] = json!("LIFR");
    let answer = ask("best_fields", &input);
    assert_eq!(answer["needs_airplane"], json!(false));
    // Burlington in LIFR falls behind the others.
    assert_eq!(idents(&answer).last().unwrap(), "BUU");
    assert!(answer["fields"][0]["ete_min"].as_f64().unwrap() > 0.0);
}

/// Two fields alike in all but who may land there, ten miles each way.
fn twins(first: Value, second: Value) -> Value {
    let field = |ident: &str, lon: f64, usage: &Value| {
        let mut f = json!({
            "ident": ident, "lat": 42.59, "lon": lon, "elevation_ft": 900,
            "runways": [{ "length_ft": 4000, "surface": "ASP", "runway_ends": [{ "ident": "09", "heading_true_deg": 90 }, { "ident": "27", "heading_true_deg": 270 }] }],
        });
        for (k, v) in usage.as_object().unwrap() {
            f[k] = v.clone();
        }
        f
    };
    // The private or military one a little nearer, so only its use puts it second.
    json!([field("NEAR", -88.30, &first), field("FAR", -88.60, &second)])
}

#[test]
fn a_diversion_ranks_a_private_or_military_field_after_a_public_one() {
    // With the engine running there is no emergency, so the owner's or the
    // service's permission stands (14 CFR 91.3(b) is for an emergency):
    // the public field comes first and the other says why.
    let at = json!({ "lat": 42.5917, "lon": -88.4334 });
    for (usage, words) in [
        (json!({ "private": true }), "Private: permission required"),
        (json!({ "military": "military" }), "Military: prior permission required"),
    ] {
        let fields = twins(usage.clone(), json!({}));
        let answer = ask("best_fields", &json!({ "mode": "diversion", "at": at, "airplane": { "cruise_tas_kt": 110 }, "fields": fields }));
        assert_eq!(idents(&answer), ["FAR", "NEAR"], "{usage}");
        let reasons = answer["fields"][1]["reasons"].as_array().unwrap();
        assert!(reasons.iter().any(|r| r["text"] == json!(words) && r["tone"] == json!("caution")), "{reasons:?}");
        // In a glide it counts for nothing: the nearer field first.
        let glide = ask("best_fields", &json!({ "mode": "glide", "at": at, "fields": twins(usage.clone(), json!({})) }));
        assert_eq!(idents(&glide), ["NEAR", "FAR"], "{usage}");
    }
}

#[test]
fn a_joint_use_field_is_public_use_not_military() {
    // KFHU, Sierra Vista Municipal-Libby AAF: OWNERSHIP_TYPE_CODE MR,
    // FACILITY_USE_CODE PU (NASR 2026-10-29), open to civil airplanes.
    let at = json!({ "lat": 42.5917, "lon": -88.4334 });
    let fields = twins(json!({ "military": "joint" }), json!({}));
    let diversion = ask("best_fields", &json!({ "mode": "diversion", "at": at, "airplane": { "cruise_tas_kt": 110 }, "fields": fields }));
    assert_eq!(idents(&diversion), ["NEAR", "FAR"]);
    assert_eq!(diversion["fields"][0]["military"], json!("joint"));
    let glide = ask("best_fields", &json!({ "mode": "glide", "at": at, "fields": twins(json!({ "military": "joint" }), json!({})) }));
    let reasons = glide["fields"][0]["reasons"].as_array().unwrap();
    assert!(reasons.iter().all(|r| !r["text"].as_str().unwrap().contains("Military")), "{reasons:?}");
    let military = ask("best_fields", &json!({ "mode": "glide", "at": at, "fields": twins(json!({ "military": "military" }), json!({})) }));
    assert!(military["fields"][0]["reasons"].as_array().unwrap().iter().any(|r| r["text"].as_str().unwrap().starts_with("Military field")));
    // A flag of the old kind is refused, not read as military.
    assert!(call(
        "best_fields",
        &json!({ "at": at, "fields": [{ "ident": "X", "lat": 42.6, "lon": -88.4, "runways": [], "military": true }] }).to_string()
    )
    .is_err());
}

#[test]
fn the_airport_use_words_are_one_line_for_every_app() {
    // The owner's words, 2026-11-13.
    let words = |v: Value| ask("airport_use_words", &v);
    assert_eq!(
        words(json!({ "private": true })),
        json!({ "use": "private", "words": "Private: permission required", "public_use": false })
    );
    assert_eq!(
        words(json!({ "military": "military" })),
        json!({ "use": "military", "words": "Military: prior permission required", "public_use": false })
    );
    assert_eq!(words(json!({ "military": "joint" })), json!({ "use": "joint", "words": null, "public_use": true }));
    assert_eq!(words(json!({})), json!({ "use": "public", "words": null, "public_use": true }));
    // The search's Public filter: KMXF (military) is out, KFHU (joint) in.
    assert_eq!(ask("public_use", &json!({ "military": "military" })), json!(false));
    assert_eq!(ask("public_use", &json!({ "military": "joint" })), json!(true));
    assert_eq!(ask("public_use", &json!({ "private": true })), json!(false));
    // 3LL4: NASR INSPECT_METHOD_CODE 2, LAST_INFO_RESPONSE 2023/08/23.
    assert_eq!(
        ask("airport_data_words", &json!({ "data_source": "owner-reported", "info_date": "2023-08-23" })),
        json!("Owner-reported, last updated Aug 2023")
    );
    assert_eq!(ask("airport_data_words", &json!({ "data_source": "inspected", "info_date": "2025-07-30" })), Value::Null);
    // IL11: private, no NOTAM_ID; 3CK: public, NOTAM_ID IKK.
    assert_eq!(
        ask("airport_notams_none", &json!({ "private": true, "notam_id": null })),
        json!("No NOTAMs are issued for this private-use field.")
    );
    assert_eq!(ask("airport_notams_none", &json!({ "notam_id": "IKK" })), Value::Null);
}

#[test]
fn the_mayday_is_in_the_aims_order() {
    let case = &fixture()["mayday"];
    let answer = ask("mayday_call", &case["input"]);
    assert_eq!(answer["lines"], case["lines"]);
    assert_eq!(answer["missing"], case["missing"]);
    assert_eq!(answer["squawk"], json!("7700"));
    let mhz: Vec<&Value> = answer["channels"].as_array().unwrap().iter().map(|c| &c["mhz"]).collect();
    assert_eq!(json!(mhz), case["mhz"]);
}

#[test]
fn the_checklist_opens_at_the_emergency_asked() {
    for case in fixture()["sections"].as_array().unwrap() {
        let answer = ask("checklist_section", &json!({ "titles": case["titles"], "want": case["want"] }));
        assert_eq!(answer, case["index"], "{case}");
    }
}

#[test]
fn with_no_airplane_the_guidance_is_general_and_sourced() {
    // The owner, 2026-11-09: no airplane, no airplane's figures -- fly,
    // a field, 7700, MAYDAY and 121.5, each from the AIM or the AFH.
    let items = ask("emergency_guidance", &json!({}))["items"].as_array().unwrap().clone();
    assert_eq!(items[0]["title"], json!("Fly the airplane"));
    assert!(items.iter().all(|i| !i["source"].as_str().unwrap().is_empty()));
    assert!(items.iter().any(|i| i["title"] == json!("Squawk 7700") && i["source"].as_str().unwrap().contains("AIM 6-2-2")));
    assert!(items.iter().any(|i| i["title"].as_str().unwrap().contains("121.5")));
    // Nothing of any one airplane's: no knots, no nm, no POH.
    let words = serde_json::to_string(&items).unwrap();
    assert!(!words.contains(" kt") && !words.contains(" nm") && !words.contains("POH"), "{words}");
}
