//! The winds aloft a leg flies in, read from the grid by level and by
//! hour (wind_aloft_at), held to the shared fixture the planner reads too
//! (apps/web/src/lib/fixtures/windsAloftGrid.json).

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/windsAloftGrid.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn near(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => (g.as_f64().unwrap() - w.as_f64().unwrap()).abs() < 1e-6,
        (Value::Object(g), Value::Object(w)) => g.len() == w.len() && w.iter().all(|(k, v)| g.get(k).is_some_and(|x| near(x, v))),
        _ => got == want,
    }
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("wind_aloft_at", &case["input"].to_string()).unwrap()).unwrap();
        assert!(near(&answer, &case["expected"]), "{}: {answer}", case["why"]);
    }
}
