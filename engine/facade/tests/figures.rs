//! The four pilot pages' figures (wingtip_engine::figures), held to the
//! cases the planner's tests hold app.figures to (services/planner/tests/
//! test_figures_*.py), themselves the web's lib/debrief, lib/diversion,
//! lib/holdEntry and lib/lostComms tests.

use serde_json::Value;
use wingtip_engine::figures::debrief::{self, Checkpoint, Point};
use wingtip_engine::figures::diversion::{self, Air};
use wingtip_engine::figures::holding::{self, Entry};
use wingtip_engine::figures::lost_comms::{self, Because};
use wingtip_engine::figures::words;

fn near(a: f64, b: f64, within: f64) -> bool {
    (a - b).abs() <= within
}

// --- Words ----------------------------------------------------------------

#[test]
fn figures_are_written_as_javascript_writes_them() {
    assert_eq!(words::js_round(2.5), 3);
    assert_eq!(words::js_round(-2.5), -2);
    // toFixed's tie goes up where Rust's own format takes it to the even.
    assert_eq!(words::to_fixed(0.25, 1), "0.3");
    assert_eq!(words::to_fixed(18.0, 1), "18.0");
    assert_eq!(words::to_fixed(9.95, 1), "9.9"); // 9.949999... as a double
    assert_eq!(words::to_fixed(99.96, 1), "100.0");
    assert_eq!(words::to_fixed(-0.04, 1), "-0.0");
    assert_eq!(words::to_fixed(2.5, 0), "3");
    assert_eq!(words::grouped(12_500.0), "12,500");
    assert_eq!(words::grouped(-499.5), "-500");
    assert_eq!(words::grouped(-0.4), "0");
    assert_eq!(words::grouped(1_234_567.0), "1,234,567");
    assert_eq!(words::alt_ft(None), "—");
    assert_eq!(words::bearing(0.0), "360°");
    assert_eq!(words::bearing(4.6), "005°");
    assert_eq!(words::bearing(-30.0), "330°");
    assert_eq!(words::wind_correction(8.4), "+8°");
    assert_eq!(words::wind_correction(-3.0), "−3°");
    assert_eq!(words::wind_correction(-0.4), "0°");
}

#[path = "figures/drill_cases.rs"]
mod drill_cases;
#[path = "figures/holding_cases.rs"]
mod holding_cases;
