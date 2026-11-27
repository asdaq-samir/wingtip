//! The Brief's Go / No-Go, one copy for the planner (app.gonogo, through
//! wingtip_native, for POST /api/go-no-go) and the phones (engine/bindings/ffi), so
//! neither states a rule of its own (docs/NATIVE.md): the seven findings
//! and the line over them, and what each is worked out from. Each was
//! app.gonogo's Python, itself the web app's TypeScript ported line for
//! line with the same words and sources; where the two had drifted apart
//! the web's rule was taken (the coordinator's decision, 3 Nov 2026). The
//! web app asks them by name too, with no copy of its own (2026-11-17).
//!
//! - `verdict`: the findings and the line over them (lib/verdict), and
//!   the IFR alternate's say in them (useAlternate, FlightBriefingView);
//! - `adverse`: the Brief's Adverse Conditions rows under its findings, at
//!   most three, a TFR crossed, the SIGMETs, CWAs, urgent PIREPs and
//!   G-AIRMETs met on the route (AIM 7-1-5(b)(1), 7-1-6);
//! - `brief`: the findings put together as the Brief shows them, with the
//!   alternate, the fields row and no airplane's where none is picked,
//!   and the line over them (`gonogo_brief`);
//! - `glance`: the Brief as it opens -- the findings a pilot acts on, at
//!   most three, each a sentence with what to do, why and the rule it
//!   rests on, and the rest in one row (`gonogo_glance_lines`);
//! - `minimums`: where the weather is under the pilot's own (lib/minimums,
//!   lib/wind);
//! - `icing`: under IFR, a flight planned into icing (lib/icing);
//! - `frat`: the risk assessment and the airplane's airworthiness
//!   (lib/frat, lib/airworthiness);
//! - `runways`: the runway check at each field (lib/runwayCheck,
//!   lib/takeoffLanding, lib/pattern's runwayFlown);
//! - `runway_findings`: the fields each runway finding names, from the
//!   checks (`gonogo_runway_findings`);
//! - `weight_balance`: the weight and balance (lib/weightBalance);
//! - `permission`: a private or military-only departure, destination or
//!   stop, a row of its own after the seven;
//! - `route_figures`: the least fuel margin, the fuel required, the
//!   reserve and the TFRs in force and near, from the nav log's totals;
//! - `pass_times`: when the flight passes a point, and a TFR's or a
//!   special-use area's times then (lib/passTimes);
//! - `window`: "When should I go?" -- the findings for each departure hour
//!   the forecasts reach, and the runs of go hours, the best first
//!   (`window_calls` reads and writes it by name).
//!
//! Each takes plain data and gives plain values, with a `*_json` writer
//! for the planner's answer; the airports, runways, weather and plan they
//! are fed from stay the planner's lookups (app.routers.gonogo), and the
//! time zones the phone's or the planner's own (pass_times).

pub mod adverse;
pub mod brief;
pub mod calls;
pub mod frat;
pub mod glance;
pub mod glance_calls;
pub mod icing;
pub mod input;
pub mod minimums;
pub mod pass_times;
pub mod permission;
pub mod route_figures;
pub mod runway_findings;
pub mod runways;
pub mod verdict;
pub mod weight_balance;
pub mod window;
pub mod window_calls;

/// A list of strings as JSON.
pub(crate) fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        crate::json::string(out, s);
    }
    out.push(']');
}

/// A JavaScript string's truth: there, and not empty.
pub(crate) fn said(s: &Option<String>) -> bool {
    s.as_deref().is_some_and(|s| !s.is_empty())
}
