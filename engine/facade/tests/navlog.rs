//! The nav log (wingtip_route::navlog), asked by name as the planner asks
//! it, held to the planner's own tests from before the move
//! (services/planner/tests_wingtip/test_navlog.py, test_altitude_plans.py)
//! and to the recorded routes the planner's golden test replays
//! (services/planner/tests_wingtip/golden/*.json): the same inputs and plans.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::flight::isa_temp_c;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

#[path = "navlog/descents_cases.rs"]
mod descents_cases;
#[path = "navlog/golden_cases.rs"]
mod golden_cases;
#[path = "navlog/leg_cases.rs"]
mod leg_cases;
#[path = "navlog/plans_cases.rs"]
mod plans_cases;
