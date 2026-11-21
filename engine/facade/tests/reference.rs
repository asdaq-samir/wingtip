//! The engine's figures held to independent worked examples: the FAA's own
//! handbooks, knowledge-test supplement and AIM, each case's expected
//! figure, tolerance and page written down from the source and never from
//! the code (apps/web/src/lib/fixtures/reference). Each case is asked of
//! the contract by name, JSON in and out, as the web and the phones ask
//! it, so they can be held to the same fixtures later. A case's `expect`
//! is a list of checks on the answer at a dotted `path` ("" the whole
//! answer): `value` within `tolerance` (the source's own rounding),
//! `at_least`, `equals`, a list's `length`, or a string of the list that
//! `contains` a phrase.

mod common;

use common::{fixture, same};
use serde_json::Value;
use wingtip_engine::call::call;

/// The answer at a dotted path, Null where there is none.
fn at<'a>(answer: &'a Value, path: &str) -> &'a Value {
    if path.is_empty() {
        return answer;
    }
    path.split('.').fold(answer, |v, key| v.get(key).unwrap_or(&Value::Null))
}

/// What is wrong with one check of an answer, if anything.
fn check(answer: &Value, expect: &Value) -> Option<String> {
    let path = expect["path"].as_str().unwrap_or("");
    let got = at(answer, path);
    let fail = |want: String| Some(format!("at {path:?}: got {got}, want {want}"));
    if let Some(want) = expect.get("value").and_then(Value::as_f64) {
        let within = expect["tolerance"].as_f64().expect("a value check names its tolerance");
        return match got.as_f64() {
            Some(x) if (x - want).abs() <= within + 1e-9 => None,
            _ => fail(format!("{want} \u{b1} {within}")),
        };
    }
    if let Some(least) = expect.get("at_least").and_then(Value::as_f64) {
        return match got.as_f64() {
            Some(x) if x >= least => None,
            _ => fail(format!("at least {least}")),
        };
    }
    if let Some(want) = expect.get("equals") {
        return if same(got, want) { None } else { fail(want.to_string()) };
    }
    if let Some(want) = expect.get("length").and_then(Value::as_u64) {
        return match got.as_array() {
            Some(list) if list.len() as u64 == want => None,
            _ => fail(format!("a list of {want}")),
        };
    }
    if let Some(phrase) = expect.get("contains").and_then(Value::as_str) {
        let found = got.as_array().is_some_and(|list| list.iter().any(|s| s.as_str().is_some_and(|s| s.contains(phrase))));
        return if found { None } else { fail(format!("a line containing {phrase:?}")) };
    }
    Some(format!("at {path:?}: a check with no known kind: {expect}"))
}

/// Every case of one reference set, each asked by name; all the failures
/// together, each with its case's name and source.
fn holds(set: &str) {
    let cases = fixture(&format!("reference/{set}"));
    let cases = cases["cases"].as_array().unwrap_or_else(|| panic!("{set}: no cases"));
    assert!(!cases.is_empty(), "{set}: no cases");
    let mut failures = Vec::new();
    for case in cases {
        let name = case["name"].as_str().unwrap_or("?");
        let rule = case["rule"].as_str().unwrap_or_else(|| panic!("{set}: {name}: no rule"));
        // Every case says where it comes from and holds at least one figure.
        assert!(case["source"].as_str().is_some_and(|s| !s.is_empty()), "{set}: {name}: no source");
        let expects = case["expect"].as_array().filter(|e| !e.is_empty());
        let expects = expects.unwrap_or_else(|| panic!("{set}: {name}: nothing expected"));
        let answer = match call(rule, &case["input"].to_string()) {
            Ok(text) => serde_json::from_str::<Value>(&text).unwrap_or_else(|e| panic!("{rule} answered {text}: {e}")),
            Err(e) => {
                failures.push(format!("{name} ({rule}): {e}"));
                continue;
            }
        };
        for expect in expects {
            if let Some(why) = check(&answer, expect) {
                failures.push(format!("{name} ({rule}) {why}\n    source: {}", case["source"].as_str().unwrap_or("")));
            }
        }
    }
    assert!(failures.is_empty(), "{set}: {} of the source's figures not met:\n  {}", failures.len(), failures.join("\n  "));
}

#[test]
fn the_standard_atmosphere_is_the_handbooks() {
    // Pressure altitude off FAA-H-8083-25C Figure 11-22's table and the
    // supplement's Figure 8, Figure 11-2's temperatures and pressures, and
    // Sample Problem 1's density altitude.
    holds("atmosphere.json");
}

#[test]
fn the_wind_triangle_and_a_runways_wind_are_the_handbooks() {
    holds("wind.json");
}

#[test]
fn time_distance_fuel_and_endurance_are_the_handbooks() {
    holds("timeFuel.json");
}

#[test]
fn weight_and_balance_is_the_handbooks() {
    holds("weightBalance.json");
}

#[test]
fn a_holds_entry_and_leg_are_the_aims() {
    holds("holding.json");
}

#[test]
fn a_check_fails_where_the_figure_is_not_met() {
    // The checker itself, so a set cannot pass by checking nothing.
    let answer: Value = serde_json::json!({"gs": 88.3, "problems": ["The landing weight, 3,027 lb, is 77 lb over its most"]});
    let near = |value: f64, tolerance: f64| serde_json::json!({"path": "gs", "value": value, "tolerance": tolerance});
    assert_eq!(check(&answer, &near(88.0, 1.0)), None);
    assert!(check(&answer, &near(90.0, 1.0)).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "gs", "at_least": 89})).is_some());
    assert_eq!(check(&answer, &serde_json::json!({"path": "problems", "length": 1})), None);
    assert_eq!(check(&answer, &serde_json::json!({"path": "problems", "contains": "77 lb over"})), None);
    assert!(check(&answer, &serde_json::json!({"path": "problems", "equals": []})).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "missing", "value": 0, "tolerance": 0})).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "gs"})).is_some());
}
