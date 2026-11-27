//! One way in for every host: a rule asked by its name, its input a JSON
//! object, its answer JSON. The web app (engine/bindings/wasm, from
//! TypeScript), the planner (wingtip_native.call) and the phones (the
//! `call` engine/bindings/ffi exports through UniFFI) all come in here,
//! so a rule moved into the engine needs no new function on any of them. The answers are the planner's endpoints' own JSON,
//! snake_case, where a rule has an endpoint.
//!
//! Which function answers which name is not listed here, and none is
//! answered here: each rule's own contract file
//! (`engine/crates/<crate>/contract/<name>.json`, beside its code) names
//! the crate's function in `"x-call"`, and build.rs writes the table
//! [`call`] looks names up in from those files. The same files, assembled by
//! engine/contract/gen into engine/contract/engine.schema.json, give each
//! rule's input, answer and the source of its figures; tests/contract.rs
//! holds the answers to them.
//!
//! A name not known, or input not of its shape, is Err with a plain
//! message, never a panic.

use crate::json::{self, Value};

/// The rule `name` worked on `input`, a JSON object; the answer as JSON.
pub fn call(name: &str, input: &str) -> Result<String, String> {
    answer(name, json::parse(input)?)
}

/// [`call`] with one member's numbers handed over as they are, not as
/// JSON text: the terrain grids a route's options and its way round high
/// ground read (100,000 to 200,000 heights), which the planner would
/// otherwise write out and the engine parse back, tens of milliseconds a
/// call. `key` is set to `numbers` in the input object, so the rule reads
/// the same `Value` it would have parsed: the rule and its contract are
/// unchanged.
pub fn call_with_numbers(name: &str, input: &str, key: &str, numbers: &[f64]) -> Result<String, String> {
    let mut v = json::parse(input)?;
    if let Value::Object(members) = &mut v {
        members.retain(|(k, _)| k != key);
        members.push((key.to_owned(), Value::Array(numbers.iter().map(|&n| Value::Number(n)).collect())));
    }
    answer(name, v)
}

fn answer(name: &str, v: Value) -> Result<String, String> {
    if !matches!(v, Value::Object(_)) {
        return Err(format!("{name}: the input is not a JSON object"));
    }
    match RULES.binary_search_by(|(n, _)| (*n).cmp(name)) {
        Ok(i) => (RULES[i].1)(name, &v),
        Err(_) => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// The names the engine answers, in order: the rules' contract files'.
pub fn names() -> impl Iterator<Item = &'static str> {
    RULES.iter().map(|(n, _)| *n)
}

/// A rule's answer from its input: the function its contract file names.
type Handler = fn(&str, &Value) -> Result<String, String>;

include!(concat!(env!("OUT_DIR"), "/rules.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rule_by_name_answers_its_endpoints_json() {
        let held = call("holding", r#"{"inbound": 360, "heading": 112, "turns": "right"}"#).unwrap();
        assert!(held.starts_with(r#"{"entry":"teardrop","entry_name":"#), "{held}");
        assert!(held.contains(r#""either":"direct""#), "{held}");
        assert_eq!(call("holding_leg_minutes", r#"{"altitude_ft": 16000}"#).unwrap(), "1.5");
        assert_eq!(call("holding_leg_minutes", "{}").unwrap(), "1.0");
        assert_eq!(call("wind_triangle", r#"{"tc": 360, "tas": 50, "wind_from_deg": 270, "wind_kt": 60}"#).unwrap(), "null");
        assert_eq!(call("diversion_reasonable", r#"{"key": "mh", "typed": 2, "exact": 355}"#).unwrap(), "true");
    }

    #[cfg(feature = "route-options")]
    #[test]
    fn numbers_handed_over_answer_as_their_json_text() {
        // A wall of 12,000 ft heights across the middle of the frame, sent
        // once as JSON text and once as numbers: the same way round.
        let ask =
            r#"{"start": [0, 0], "end": [0, 3], "ceiling_ft": 10950, "fields": [{"ident": "S", "name": "S", "lat": -1.6, "lon": 1.5}]}"#;
        let frame = json::parse(&call("terrain_way_frame", ask).unwrap()).unwrap();
        let n = |k: &str| frame.get(k).and_then(Value::as_f64).unwrap() as usize;
        let (rows, cols) = (n("rows") * n("per_cell"), n("cols") * n("per_cell"));
        let heights: Vec<f64> =
            (0..rows * cols).map(|i| if (i % cols) * 2 / cols == 1 && i / cols > rows / 3 { 12_000.0 } else { 500.0 }).collect();
        let text =
            format!("{},\"terrain_ft\":[{}]}}", &ask[..ask.len() - 1], heights.iter().map(|h| h.to_string()).collect::<Vec<_>>().join(","));
        let by_text = call("terrain_way_round", &text).unwrap();
        assert_eq!(call_with_numbers("terrain_way_round", ask, "terrain_ft", &heights).unwrap(), by_text);
        assert_eq!(call_with_numbers("terrain_way_round", &text, "terrain_ft", &heights).unwrap(), by_text);
        assert_ne!(by_text, "[]");
    }

    #[test]
    fn bad_asks_are_errors_not_panics() {
        assert_eq!(call("nope", "{}").unwrap_err(), "the engine has no rule called \"nope\"");
        assert!(call("holding", "[1]").unwrap_err().contains("not a JSON object"));
        assert_eq!(call("holding", r#"{"inbound": 360}"#).unwrap_err(), "holding: \"heading\" is missing");
        assert!(call("holding", r#"{"inbound": "x", "heading": 1}"#).unwrap_err().contains("not a number"));
        assert!(call("holding", r#"{"inbound": 1, "heading": 1, "turns": "up"}"#).is_err());
        assert!(call("debrief", r#"{"checkpoints": [], "points": [{"t": 0}]}"#).is_err());
        assert!(call("diversion_reasonable", r#"{"key": "tc", "typed": 1, "exact": 1}"#).is_err());
        assert!(call("lost_comms", "{").unwrap_err().starts_with("JSON:"));
    }
}
