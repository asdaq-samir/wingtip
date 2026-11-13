//! One way in for every host: a rule asked by its name, its input a JSON
//! object, its answer JSON. The web app (engine/bindings/wasm, from
//! TypeScript), the planner (wingtip_native.call) and the phones (wt_call)
//! all come in here, so a rule moved into the engine needs no new function
//! on any of them. The answers are the planner's endpoints' own JSON,
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
    let v = json::parse(input)?;
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
