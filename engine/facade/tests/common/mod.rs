//! What the fixture tests share: an answer compared with a fixture as JSON
//! reads them. The contract's figures are JSON numbers
//! (engine/contract/engine.schema.json says "number", never "integer"), and
//! the engine writes a whole one as Python's json does, 2000.0
//! (core::json::number), where a fixture written by hand says 2000: the
//! same number to every host (JavaScript, Python, Swift's and Kotlin's
//! Double), so it is compared by value, not by how serde_json happened to
//! read it.

// Each test file takes what it needs of these.
#![allow(dead_code)]

use serde_json::Value;

/// Whether two JSON values are the same: numbers by value, arrays item by
/// item, objects member by member, anything else as it is.
pub fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(a, b)| same(a, b)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

/// `assert_eq!` for JSON, with `same`.
#[track_caller]
pub fn assert_same(got: &Value, want: &Value, what: impl std::fmt::Display) {
    assert!(same(got, want), "{what}\n  got: {got}\n want: {want}");
}

/// A case of copilot.json made whole: the base with the case's `with`
/// laid over it and its `metars` (each `{"raw", "flight_category"}`) in
/// place of those fields' METARs.
#[allow(dead_code)]
pub fn copilot_input(base: &Value, case: &Value) -> Value {
    let mut input = base.clone();
    if let Some(with) = case.get("with").and_then(Value::as_object) {
        for (k, v) in with {
            input[k.as_str()] = v.clone();
        }
    }
    let metars = case.get("metars").and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(fields) = input["fields"].as_array_mut() {
        for field in fields {
            let ident = field["ident"].as_str().unwrap_or("").to_owned();
            if let Some(raw) = metars.get(&ident) {
                field["metar"] = raw.clone();
            }
        }
    }
    input
}
