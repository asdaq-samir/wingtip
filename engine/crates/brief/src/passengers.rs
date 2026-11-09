//! The passengers' briefing on the Brief, ticked off before engine start,
//! in the order of the FAA's SAFETY briefing (the FAASTeam's "Passenger
//! SAFETY briefing", FAA Safety Briefing, Jan/Feb 2007 and Jul/Aug 2014):
//! Seat belts, Air, Fire, Exits, Traffic and talking, Your questions. Of
//! them only the belts are a rule: 14 CFR 91.107(a)(1) has the pilot in
//! command make sure each person aboard is shown how to fasten and
//! unfasten their belt and harness, and (a)(2) and (3) that they are told
//! to fasten them, and have them fastened, for taxi, takeoff and landing.
//! The rest is what the Private Pilot ACS (FAA-S-ACS-6C) asks of a
//! passenger briefing in task PA.II.B, skill S2 -- doors, passenger
//! conduct, sterile aircraft, propeller avoidance, emergency procedures --
//! cited as guidance, not as a regulation.
//!
//! The web (lib/passengers), the iPhone (Passengers.swift) and Android
//! (briefing/PassengerBriefing.kt) each kept a copy, whose sources had
//! drifted apart (#482 phase 0); they ask `passenger_briefing` now.

use crate::json;

const SAFETY: &str = "FAA Safety Briefing, Passenger SAFETY briefing";
const SAFETY_ACS: &str = "FAA Safety Briefing, Passenger SAFETY briefing; ACS PA.II.B.S2";

/// Each item: its key (the ticks kept for a flight are by it), what to
/// tell them, and where it comes from.
pub const ITEMS: [(&str, &str, &str); 7] = [
    ("pax-belts", "How to fasten and unfasten their seat belts and shoulder harnesses", "14 CFR 91.107(a)(1)"),
    ("pax-fastened", "Belts fastened to taxi, take off and land, seats locked", "14 CFR 91.107(a)(2), (3)"),
    ("pax-air", "Air vents and heat, and to say if they feel unwell", SAFETY),
    ("pax-fire", "The fire extinguisher: where it is and how it works", SAFETY),
    ("pax-exits", "The doors, how to get out, the survival kit, and clear of the propeller", SAFETY_ACS),
    ("pax-traffic", "Point out traffic; quiet while the pilot is on the radio and close to the ground", SAFETY_ACS),
    ("pax-questions", "Their questions", SAFETY),
];

/// The rule `name`: `passenger_briefing` from `{}`, `[{"key", "title",
/// "rule"}]` in the briefing's order.
pub fn call(name: &str, _v: &crate::json::Value) -> Result<String, String> {
    match name {
        "passenger_briefing" => {
            let mut out = String::from("[");
            for (i, (key, title, rule)) in ITEMS.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"key\":");
                json::string(&mut out, key);
                out.push_str(",\"title\":");
                json::string(&mut out, title);
                out.push_str(",\"rule\":");
                json::string(&mut out, rule);
                out.push('}');
            }
            out.push(']');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
