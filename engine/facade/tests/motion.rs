//! The things that move (wingtip_engine::motion), asked by name as every
//! host asks them (crate::call), held to the cases the web's own tests
//! hold its lib/map/traffic, lib/aircraftAlerts, lib/map/glide,
//! navlog/profile and navlog/dryRun to, and to the shared traffic fixture
//! (apps/web/src/lib/fixtures/traffic.json) the phone's Traffic is held to.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::geo::distance_nm;
use wingtip_engine::units::{FT_PER_M, FT_PER_NM};

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn close(a: f64, b: f64, within: f64) -> bool {
    (a - b).abs() <= within
}

/// Every number as a float, so 42 and 42.0 are the same, as they are to
/// the web.
fn norm(v: &Value) -> Value {
    match v {
        Value::Number(x) => json!(x.as_f64().unwrap()),
        Value::Array(items) => Value::Array(items.iter().map(norm).collect()),
        Value::Object(m) => Value::Object(m.iter().map(|(k, x)| (k.clone(), norm(x))).collect()),
        other => other.clone(),
    }
}

fn n(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("{v} is not a number"))
}

#[path = "motion/dry_run_cases.rs"]
mod dry_run_cases;
#[path = "motion/flight_cases.rs"]
mod flight_cases;
#[path = "motion/track_cases.rs"]
mod track_cases;
#[path = "motion/traffic_cases.rs"]
mod traffic_cases;
