//! A fixture set of cases, each a rule asked by name and checks on its
//! answer, written down from a source and never from the code:
//! fixtures/reference (the FAA's worked examples) and fixtures/rules (each
//! rule's figures and boundaries, from the regulation, the AIM, the AC or
//! the data set it cites). A case's `expect` is a list of checks on the
//! answer at a dotted `path` ("" the whole answer, a number an item of a
//! list): `value` within `tolerance` (the source's own rounding),
//! `at_least`, `at_most`, `equals`, a list's `length`, or a string, or a
//! string of the list, that `contains` a phrase. A string `"$name"` in an
//! input is the set's `shared` value of that name.

use super::{fixture, same};
use serde_json::Value;
use wingtip_engine::call::call;

/// The answer at a dotted path, Null where there is none.
pub fn at<'a>(answer: &'a Value, path: &str) -> &'a Value {
    if path.is_empty() {
        return answer;
    }
    path.split('.').fold(answer, |v, key| match (v, key.parse::<usize>()) {
        (Value::Array(list), Ok(i)) => list.get(i).unwrap_or(&Value::Null),
        _ => v.get(key).unwrap_or(&Value::Null),
    })
}

/// A case's input with each `"$name"` string in it put back as the set's
/// `shared` value of that name: a table many cases read, written once.
fn with_shared(input: &Value, shared: &Value) -> Value {
    match input {
        Value::String(s) if s.starts_with('$') => with_shared(shared.get(&s[1..]).unwrap_or_else(|| panic!("no shared {s}")), shared),
        Value::Array(list) => Value::Array(list.iter().map(|v| with_shared(v, shared)).collect()),
        Value::Object(map) => Value::Object(map.iter().map(|(k, v)| (k.clone(), with_shared(v, shared))).collect()),
        other => other.clone(),
    }
}

/// What is wrong with one check of an answer, if anything.
pub fn check(answer: &Value, expect: &Value) -> Option<String> {
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
    if let Some(most) = expect.get("at_most").and_then(Value::as_f64) {
        return match got.as_f64() {
            Some(x) if x <= most => None,
            _ => fail(format!("at most {most}")),
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
        let found = match got {
            Value::String(s) => s.contains(phrase),
            _ => got.as_array().is_some_and(|list| list.iter().any(|s| s.as_str().is_some_and(|s| s.contains(phrase)))),
        };
        return if found { None } else { fail(format!("a line containing {phrase:?}")) };
    }
    Some(format!("at {path:?}: a check with no known kind: {expect}"))
}

/// Every case of one set (its path under the fixtures), each asked by
/// name; all the failures together, each with its case's name and source.
pub fn holds(set: &str) {
    let fixture = fixture(set);
    let shared = &fixture["shared"];
    let cases = fixture["cases"].as_array().unwrap_or_else(|| panic!("{set}: no cases"));
    assert!(!cases.is_empty(), "{set}: no cases");
    let mut failures = Vec::new();
    for case in cases {
        let name = case["name"].as_str().unwrap_or("?");
        let rule = case["rule"].as_str().unwrap_or_else(|| panic!("{set}: {name}: no rule"));
        // Every case says where it comes from and holds at least one figure.
        assert!(case["source"].as_str().is_some_and(|s| !s.is_empty()), "{set}: {name}: no source");
        let expects = case["expect"].as_array().filter(|e| !e.is_empty());
        let expects = expects.unwrap_or_else(|| panic!("{set}: {name}: nothing expected"));
        let answer = match call(rule, &with_shared(&case["input"], shared).to_string()) {
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
