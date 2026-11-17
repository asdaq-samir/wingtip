//! An airplane's emitter category and squawk in words, and the registry's
//! airplanes (wingtip_engine::aircraft), held to the cases the web's
//! lib/aircraftChoice tests and the iPhone's RegisteredTests hold their
//! copies to.

use serde_json::{json, Value};
use wingtip_engine::aircraft::registry::{is_n_number, profile_of};
use wingtip_engine::call::call;

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap()).unwrap()
}

#[test]
fn an_n_number_is_told_by_its_shape() {
    // 14 CFR 47.15(b): the web's and the iPhone's cases.
    for n in ["N3429J", "N1", "N12345", "N172SP", "N1234Z", "N123AB", "N9"] {
        assert!(is_n_number(n), "{n}");
        assert_eq!(ask("n_number", json!({"text": n})), true);
    }
    // Letters before figures, three letters, six symbols, a leading zero,
    // the letters I and O, and other words: none.
    for n in ["N0123", "N123456", "C172", "KDLH", "N", "N1A2B", "N12ABC", "NABCD", "N1234AB", "N12I", "N1O", "n172sp", " N172SP"] {
        assert!(!is_n_number(n), "{n}");
    }
}

#[test]
fn a_registered_type_flies_on_its_stock_profile() {
    let p = |maker: &str, model: &str, year: Option<f64>| profile_of(Some(maker), Some(model), year);
    assert_eq!(p("Cessna", "172S", None), Some("c172"));
    assert_eq!(p("CESSNA", "172", None), Some("c172"));
    assert_eq!(p("Piper", "PA-28-181", None), Some("pa28"));
    assert_eq!(p("Cessna", "150G", None), Some("c150"));
    assert_eq!(p("Cessna", "A152", None), Some("c152"));
    assert_eq!(p("Cessna", "182T", None), Some("c182"));
    assert_eq!(p("Piper", "PA-28-140", Some(1971.0)), Some("pa28140"));
    assert_eq!(p("Piper", "PA-28-140", Some(1975.0)), Some("pa28140cruiser"));
    // No year: the Cruiser's, the lower ceiling.
    assert_eq!(p("Piper", "PA-28-140", None), Some("pa28140cruiser"));
    assert_eq!(p("Cirrus Design Corp", "SR22", None), Some("sr22"));
    assert_eq!(p("Diamond Aircraft IND Inc", "DA 40 NG", None), Some("da40ng"));
    assert_eq!(p("Piper", "PA-28-161", None), Some("pa28161"));
    assert_eq!(p("Piper", "PA-28R-201", None), Some("pa28r201"));
    assert_eq!(p("Mooney", "M20J", None), Some("m20j"));
    assert_eq!(p("Cessna", "FA150L", None), Some("c150"));
    assert_eq!(p("Cessna", "F150M", None), Some("c150"));
    // A model sharing the name but not the figures: none.
    for (maker, model) in [
        ("Cessna", "R182"),
        ("Cessna", "T182T"),
        ("Piper", "PA-28-180"),
        ("Cirrus Design Corp", "SR22T"),
        ("Diamond Aircraft IND Inc", "DA 40"),
        ("Piper", "PA-28R-201T"),
        ("Beech", "A36"),
        ("Cessna", "150N"),
    ] {
        assert_eq!(p(maker, model, None), None, "{maker} {model}");
    }
    assert_eq!(ask("registered_profile", json!({"manufacturer": "Piper", "model": "PA-28-140", "year": 1971})), "pa28140");
    assert_eq!(ask("registered_profile", json!({})), Value::Null);
}

#[test]
fn an_emitter_category_by_its_do_260b_name() {
    // GDL 90 Table 11's categories, as the kept airplanes' shapes read them.
    let named: Vec<Value> =
        ["A1", "A3", "A6", "A7", "B1", "B2", "B5", ""].iter().map(|c| ask("emitter_category", json!({"category": c}))).collect();
    assert_eq!(
        named,
        [
            json!("light"),
            json!("large"),
            json!("high_performance"),
            json!("rotorcraft"),
            json!("glider"),
            json!("lighter_than_air"),
            Value::Null,
            Value::Null
        ]
    );
    assert_eq!(ask("emitter_category", json!({})), Value::Null);
}

#[test]
fn a_squawk_says_what_it_means() {
    // 7500 unlawful interference (AIM 6-3-4), 7600 two-way radio failure
    // (AIM 6-4-2), 7700 an emergency (AIM 6-2-2); 7777 and 1200 nothing.
    let said: Vec<Value> = ["7500", "7600", "7700", "7777", "1200"].iter().map(|s| ask("squawk_meaning", json!({"squawk": s}))).collect();
    assert_eq!(said, [json!("hijack"), json!("lost radio"), json!("emergency"), Value::Null, Value::Null]);
    assert_eq!(ask("squawk_meaning", json!({"squawk": null})), Value::Null);
}
