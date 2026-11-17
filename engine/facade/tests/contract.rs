//! The engine against its contract (engine/contract/engine.schema.json),
//! the one statement of every call's input and answer that the web's types
//! (apps/web/src/lib/engine/contract.ts) are generated from: every name the
//! engine dispatches has its entry there and no other does, and the answers
//! to the shared fixtures (apps/web/src/lib/fixtures), asked as the hosts ask,
//! are of the shapes it gives. A member renamed in Rust then fails here,
//! not on the phone.

mod common;

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::PathBuf;
use wingtip_engine::call::call;

#[path = "contract/altitude_cases.rs"]
mod altitude_cases;
#[path = "contract/flight_rules_cases.rs"]
mod flight_rules_cases;
#[path = "contract/pilot_cases.rs"]
mod pilot_cases;
#[path = "contract/radio_cases.rs"]
mod radio_cases;
#[path = "contract/route_cases.rs"]
mod route_cases;
#[path = "contract/web_cases.rs"]
mod web_cases;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(path: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

fn contract() -> Value {
    read_json("engine/contract/engine.schema.json")
}

fn fixture(name: &str) -> Value {
    read_json(&format!("apps/web/src/lib/fixtures/{name}"))
}

fn schema_names() -> BTreeSet<String> {
    contract()["properties"].as_object().unwrap().keys().cloned().collect()
}

#[test]
fn every_name_dispatched_is_in_the_contract_and_no_other() {
    // The dispatcher's table and the contract are both written from the
    // rules' contract files (build.rs, engine/contract/gen), so they hold
    // the same names unless the committed contract is stale, which
    // wingtip-contract-gen's own test also catches.
    let code: BTreeSet<String> = wingtip_engine::call::names().map(str::to_owned).collect();
    let schema = schema_names();
    let missing: Vec<_> = code.difference(&schema).collect();
    let extra: Vec<_> = schema.difference(&code).collect();
    assert!(missing.is_empty(), "the engine answers these, and the contract has no entry for them: {missing:?}");
    assert!(extra.is_empty(), "the contract has these, and the engine dispatches no such name: {extra:?}");
    // Each file's "x-call" is a function that answers its name: asked with
    // nothing, it may refuse the input, never the name.
    for name in &code {
        if let Err(e) = call(name, "{}") {
            assert!(!e.contains("has no rule called"), "{name}: its contract file's \"x-call\" does not answer it: {e}");
        }
    }
    let required: BTreeSet<String> = contract()["required"].as_array().unwrap().iter().map(|n| n.as_str().unwrap().to_owned()).collect();
    assert_eq!(required, schema, "every name is required in the contract");
}

/// The contract with no name required, so one call at a time is checked
/// against it: `{name: {"input", "answer"}}`.
struct Checker {
    validator: jsonschema::Validator,
    checked: BTreeSet<String>,
}

impl Checker {
    fn new() -> Self {
        let mut schema = contract();
        schema["required"] = json!([]);
        Checker { validator: jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema"), checked: BTreeSet::new() }
    }

    /// The rule `name` asked `input`, the input and the answer held to the
    /// contract; the answer.
    fn ask(&mut self, name: &str, input: Value) -> Value {
        let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
        let answer: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"));
        let mut asked = Map::new();
        asked.insert(name.to_owned(), json!({ "input": input, "answer": answer }));
        let asked = Value::Object(asked);
        let errors: Vec<String> = self.validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{name}: not of the contract's shape:\n{}\ninput {input}\nanswer {answer}", errors.join("\n"));
        self.checked.insert(name.to_owned());
        answer
    }
}

#[test]
fn the_shared_fixtures_answers_are_of_the_contracts_shapes() {
    let mut c = Checker::new();

    radio_cases::cases(&mut c);
    pilot_cases::cases(&mut c);
    flight_rules_cases::cases(&mut c);
    altitude_cases::cases(&mut c);
    route_cases::cases(&mut c);
    web_cases::cases(&mut c);

    // Every fixture above was asked, and these are the names it reaches:
    // a name dropped from it fails here rather than going unchecked.
    assert!(c.checked.len() >= 30, "only {} names were checked: {:?}", c.checked.len(), c.checked);
}
