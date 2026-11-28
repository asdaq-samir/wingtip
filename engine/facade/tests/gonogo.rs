//! The Go / No-Go's rules (wingtip_engine::gonogo), held to every case the
//! planner's tests hold app.gonogo to (services/planner/tests/
//! test_gonogo_*.py), themselves the web's lib/verdict, lib/minimums,
//! lib/icing, lib/frat, lib/airworthiness, lib/runwayCheck,
//! lib/runwayFlown, lib/weightBalance and lib/passTimes tests -- and to the
//! three places the Python had drifted from the web, where the web's rule
//! was taken: FL-045, a variable wind all crosswind, and a pick matched to
//! its field as lib/procedures sameField matches it.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::figures::words;
use wingtip_engine::gonogo::frat::{self, Currency, Inspections, Squawk, VorCheck};
use wingtip_engine::gonogo::icing::{self, Selection};
use wingtip_engine::gonogo::minimums::{self, Landing, Minimums, Report as Winds, RunwayWind};
use wingtip_engine::gonogo::pass_times;
use wingtip_engine::gonogo::runways::{self, Airplane, End, Field, Picks, Report, Runway, ShortField};
use wingtip_engine::gonogo::verdict::{self, Alternates, FiledAlternate, Input};
use wingtip_engine::gonogo::weight_balance::{self, Load, Loading, Station};

fn s(v: &str) -> String {
    v.to_owned()
}

fn strings(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| s(x)).collect()
}

fn near(a: f64, b: f64, within: f64) -> bool {
    (a - b).abs() <= within
}

// --- words ------------------------------------------------------------------

#[test]
fn a_cruising_altitude_is_written_fl_dash_as_the_owner_asked() {
    // lib/format flightLevel, the owner's 2026-10-27 format; the Python wrote
    // FL045 and FL--- until the engine took the web's.
    assert_eq!(words::flight_level(Some(4500.0)), "FL-045");
    assert_eq!(words::flight_level(Some(12_500.0)), "FL-125");
    assert_eq!(words::flight_level(Some(0.0)), "FL-000");
    assert_eq!(words::flight_level(None), "FL-___");
    // String(-5).padStart(3, "0"), as the web pads it.
    assert_eq!(words::flight_level(Some(-500.0)), "FL-0-5");
}

#[test]
fn numbers_are_written_as_javascript_writes_them() {
    assert_eq!(words::js_num(28.0), "28");
    assert_eq!(words::js_num(2.3), "2.3");
    assert_eq!(words::js_num(-0.0), "0");
    assert_eq!(words::js_num(1e-5), "0.00001");
    assert_eq!(words::js_num(1e-7), "1e-7");
    assert_eq!(words::js_num(1.5e21), "1.5e+21");
    assert_eq!(words::js_opt(None), "null");
    assert_eq!(words::js_round(0.49999999999999994), 0);
    assert_eq!(words::one(2.25), 2.3);
    assert_eq!(words::ceiling_and_visibility(Some(3500.0), Some(6.0)), "3,500 ft · 6 sm");
    assert_eq!(words::ceiling_and_visibility(None, None), "no ceiling · —");
    // To the hundredth, down: 4000 m is 2.4854... sm, never 2.49.
    assert_eq!(words::ceiling_and_visibility(None, Some(2.485_485)), "no ceiling · 2.48 sm");
}

#[path = "gonogo/audit_cases.rs"]
mod audit_cases;
#[path = "gonogo/frat_cases.rs"]
mod frat_cases;
#[path = "gonogo/minimums_cases.rs"]
mod minimums_cases;
#[path = "gonogo/pass_times_cases.rs"]
mod pass_times_cases;
#[path = "gonogo/runways_cases.rs"]
mod runways_cases;
#[path = "gonogo/runways_more_cases.rs"]
mod runways_more_cases;
#[path = "gonogo/verdict_cases.rs"]
mod verdict_cases;
