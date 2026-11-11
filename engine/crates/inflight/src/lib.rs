//! wingtip-inflight: the flight under way, over wingtip-weather (a
//! METAR's figures), wingtip-flight (the reserve, the night) and
//! wingtip-brief (the pilot's minimums and the emergency assistant's
//! best_fields), the lowest crate that sees all three (engine/README.md).
//!
//! - watch, checks, message: `copilot_watch`, the in-flight copilot's
//!   messages, most pressing first, each with its sources;
//! - fields: the copilot's best alternative, brief's best_fields in its
//!   diversion mode held to the copilot's own checks (weather, fuel).
//!
//! Advisory only, from a phone's GPS and the data the planner last had:
//! not a substitute for the pilot's own decisions (14 CFR 91.3) or
//! preflight action (91.103). Nothing here refuses a flight.

pub mod checks;
pub mod fields;
pub mod input;
pub mod message;
pub mod watch;

use wingtip_core::json::{self, Value};

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let answer = match name {
        "copilot_watch" => watch::rule(name, v)?,
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    let mut out = String::new();
    json::value(&mut out, &answer);
    Ok(out)
}
