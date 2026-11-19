//! Runways, the wind on them and the traffic pattern (wingtip_engine::runway),
//! held to every case the web's tests hold lib/wind, lib/pattern,
//! lib/runwayFit, lib/takeoffLanding and lib/trafficPattern to
//! (wind.test.ts, windPick.test.ts, runwayFlown.test.ts,
//! runwayFit.test.ts, trafficPattern.test.ts, weightBalance.test.ts), and
//! the planner's tests hold wingtip.runway_wind and wingtip.pattern to
//! (services/planner/tests_wingtip/test_runway_wind*.py, test_pattern.py), asked as the hosts ask
//! them: by name, JSON in and out.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::runway::{circuit, pick, wind};

fn ask(name: &str, input: Value) -> Value {
    let out = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&out).unwrap_or_else(|e| panic!("{name} answered {out}: {e}"))
}

fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("{v} is not a number"))
}

fn near(a: f64, b: f64, within: f64) -> bool {
    (a - b).abs() <= within
}

/// A runway of two ends at their true headings, as the planner sends one.
fn runway(ends: &[(&str, f64)], length_ft: f64, wind: Value) -> Value {
    json!({
        "closed": false, "length_ft": length_ft, "surface": "ASP",
        "runway_ends": ends.iter().map(|(i, h)| json!({"ident": i, "heading_true_deg": h, "traffic": "left"})).collect::<Vec<_>>(),
        "wind": wind,
    })
}

fn c81() -> Value {
    json!([runway(&[("06", 58.0), ("24", 238.0)], 3573.0, Value::Null), runway(&[("09", 88.0), ("27", 268.0)], 3270.0, Value::Null)])
}

fn kdlh() -> Value {
    json!([
        runway(
            &[("03", 31.0), ("21", 211.0)],
            5719.0,
            json!({"end": "21", "headwind_kt": 7, "crosswind_kt": -1, "gust_crosswind_kt": null})
        ),
        runway(
            &[("09", 91.0), ("27", 271.0)],
            10591.0,
            json!({"end": "27", "headwind_kt": 2, "crosswind_kt": -7, "gust_crosswind_kt": null})
        ),
    ])
}

#[path = "runway/fit_cases.rs"]
mod fit_cases;
#[path = "runway/pick_cases.rs"]
mod pick_cases;
#[path = "runway/wind_cases.rs"]
mod wind_cases;
