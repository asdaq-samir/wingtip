//! The in-flight copilot (`copilot_watch`), its alternative the emergency
//! assistant's `best_fields`, against the shared fixture copilot.json, a dry run from
//! KUGN to KOSH; and the boundaries each message turns on, from their
//! sources: 91.155(c) and (d)'s 1,000 ft and 3 sm, 91.151(a)'s 30 minutes
//! by day and 45 at night, 91.167(a)(3)'s 45 under IFR.

mod common;

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/copilot.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn watch(with: Value, metars: Value) -> Value {
    let f = fixture();
    ask("copilot_watch", &common::copilot_input(&f["base"], &json!({ "with": with, "metars": metars })))
}

fn kinds(answer: &Value) -> Vec<String> {
    answer["messages"].as_array().unwrap().iter().map(|m| m["kind"].as_str().unwrap().to_owned()).collect()
}

#[test]
fn the_fixtures_first_messages() {
    let f = fixture();
    for case in f["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let answer = ask("copilot_watch", &common::copilot_input(&f["base"], case));
        let messages = answer["messages"].as_array().unwrap();
        let Some(expect) = case["expect"].as_object() else {
            assert!(messages.is_empty(), "{name}: said {messages:?}");
            continue;
        };
        let first = messages.first().unwrap_or_else(|| panic!("{name}: said nothing"));
        assert_eq!(first["kind"], expect["kind"], "{name}: {first}");
        assert_eq!(first["level"], expect["level"], "{name}: {first}");
        if let Some(alt) = expect.get("alternative") {
            assert_eq!(&first["alternative"]["ident"], alt, "{name}: {first}");
        }
        if let Some(has) = expect.get("title_has").and_then(Value::as_str) {
            assert!(first["title"].as_str().unwrap().contains(has), "{name}: {}", first["title"]);
        }
        if let Some(elsewhere) = expect.get("elsewhere") {
            assert_eq!(&first["elsewhere"], elsewhere, "{name}");
        }
        if let Some(count) = expect.get("count").and_then(Value::as_u64) {
            assert_eq!(messages.len() as u64, count, "{name}: {messages:?}");
        }
        assert!(!first["sources"].as_array().unwrap().is_empty() || first["elsewhere"] == true, "{name}: no source");
    }
}

/// A diversion's pick that is private or military-only says so: with the
/// engine running the owner's or the service's permission stands (14 CFR
/// 91.3(b) is for an emergency). Every field but the destination made
/// private, the pick is one, and the words carry it.
#[test]
fn a_private_or_military_alternative_is_said_so() {
    let f = fixture();
    let ifr = json!({ "KOSH": { "raw": "SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992", "flight_category": "IFR" } });
    for (usage, words) in
        [(json!({ "private": true }), "private: permission needed"), (json!({ "military": "military" }), "military: prior permission")]
    {
        let mut input = common::copilot_input(&f["base"], &json!({ "metars": ifr }));
        for field in input["fields"].as_array_mut().unwrap() {
            if field["ident"] != "KOSH" {
                for (k, v) in usage.as_object().unwrap() {
                    field[k] = v.clone();
                }
            }
        }
        let said = ask("copilot_watch", &input);
        let first = &said["messages"][0];
        assert!(first["title"].as_str().unwrap().contains(words), "{first}");
        assert!(first["say"].as_str().unwrap().contains(words), "{first}");
        assert_eq!(first["alternative"]["private"], json!(usage.get("private").is_some()), "{first}");
    }
}

/// The alternative is the emergency assistant's ranking, not a second
/// one: with every other field good, it is best_fields' first diversion
/// pick after the destination.
#[test]
fn the_alternative_is_best_fields_diversion_pick() {
    let f = fixture();
    let ifr = json!({ "KOSH": { "raw": "SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992", "flight_category": "IFR" } });
    let input = common::copilot_input(&f["base"], &json!({ "metars": ifr }));
    let ranked = ask(
        "best_fields",
        &json!({
            "mode": "diversion", "at": input["own"], "speed_kt": input["own"]["gs_kt"],
            "airplane": { "cruise_tas_kt": input["own"]["gs_kt"] }, "fields": input["fields"],
        }),
    );
    let first = ranked["fields"].as_array().unwrap().iter().find(|r| r["ident"] != "KOSH").unwrap();
    let said = ask("copilot_watch", &input);
    assert_eq!(said["messages"][0]["alternative"]["ident"], first["ident"], "{said}");
}

fn metar(raw: String) -> Value {
    json!({ "KOSH": { "raw": raw, "flight_category": null } })
}

/// 91.155(c): a ceiling of 1,000 ft is VFR's least in a surface area, so
/// OVC010 is no message and OVC009 is.
#[test]
fn vfr_ceiling_either_side_of_1000_ft() {
    let at = |sky: &str| watch(json!({}), metar(format!("KOSH 091753Z 34008KT 10SM {sky} 09/01 A3001")));
    assert!(!kinds(&at("OVC010")).contains(&"weather".to_owned()));
    assert_eq!(kinds(&at("OVC009"))[0], "weather");
}

/// 91.155(d): 3 sm is VFR's least visibility there; 2 1/2 is under it.
#[test]
fn vfr_visibility_either_side_of_3_sm() {
    let at = |vis: &str| watch(json!({}), metar(format!("KOSH 091753Z 34008KT {vis} FEW045 09/01 A3001")));
    assert!(at("3SM")["messages"].as_array().unwrap().is_empty());
    assert_eq!(kinds(&at("2 1/2SM"))[0], "weather");
}

/// 91.151(a): 30 minutes by day, 45 at night; 91.167(a)(3): 45 under IFR,
/// day or night. 24 nm at 105 kt and 9 gal/h burns 2.06 gal: 6.5 gal
/// lands with 29.6 min (under 30), 6.6 with 30.3.
#[test]
fn reserve_by_day_night_and_ifr() {
    let day = |gal: f64, extra: Value| {
        let mut with = json!({ "fuel_gal": gal });
        for (k, v) in extra.as_object().unwrap() {
            with[k.as_str()] = v.clone();
        }
        watch(with, json!({}))
    };
    let d = day(6.5, json!({}));
    assert_eq!(d["reserve_min"].as_f64(), Some(30.0));
    assert_eq!(kinds(&d)[0], "fuel");
    assert!(day(6.6, json!({}))["messages"].as_array().unwrap().is_empty());
    // At 0030Z on 10 November it is night at Oshkosh (14 CFR 1.1).
    let night = day(8.0, json!({ "now_s": 1794270600 }));
    assert_eq!(night["reserve_min"].as_f64(), Some(45.0));
    assert_eq!(kinds(&night)[0], "fuel");
    let ifr = day(8.0, json!({ "rules": "IFR" }));
    assert_eq!(ifr["reserve_min"].as_f64(), Some(45.0));
    assert_eq!(kinds(&ifr)[0], "fuel");
}

/// The message never refuses anything: with no fuel figure, no fuel
/// message, and the flight's own figures are null rather than guessed.
#[test]
fn nothing_guessed_without_the_fuel() {
    let a = watch(json!({ "fuel_gal": null }), json!({}));
    assert_eq!(a["fuel_at_landing_min"], Value::Null);
    assert!(a["messages"].as_array().unwrap().is_empty());
}

/// The spoken words of the IFR case name the alternative as a pilot says
/// it: "Oshkosh just went IFR. Fond du Lac is VFR, 6 min ahead."
#[test]
fn the_words_spoken_name_the_alternative() {
    let a = watch(json!({}), metar("SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992".to_owned()));
    let first = &a["messages"][0];
    let say = first["say"].as_str().unwrap();
    assert!(say.starts_with("Oshkosh just went IFR."), "{say}");
    assert!(say.contains("Fond du Lac is VFR"), "{say}");
    assert!(first["sources"][0].as_str().unwrap().starts_with("METAR SPECI KOSH"), "{first}");
}
