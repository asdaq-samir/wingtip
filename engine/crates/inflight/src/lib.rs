//! wingtip-inflight: the flight under way, over wingtip-weather (a
//! METAR's figures), wingtip-flight (the reserve, the night) and
//! wingtip-brief (the pilot's minimums), the lowest crate that sees all
//! three (engine/README.md).
//!
//! - fields: `best_fields`, the fields to go to from where the airplane
//!   is, ranked -- the copilot's alternative and the emergency
//!   assistant's fields within glide (one ranking for both);
//! - watch, checks, message: `copilot_watch`, the in-flight copilot's
//!   messages, most pressing first, each with its sources.
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

/// The names this crate answers (call.rs).
pub const NAMES: [&str; 2] = ["best_fields", "copilot_watch"];

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let answer = match name {
        "best_fields" => fields::rule(name, v)?,
        "copilot_watch" => watch::rule(name, v)?,
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    let mut out = String::new();
    json::value(&mut out, &answer);
    Ok(out)
}
