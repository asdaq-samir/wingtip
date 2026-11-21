//! The ADIZs a route meets, asked by name (`route_adiz`; adiz.rs says how
//! and why): each point's zone, each leg's, and the Brief's one line for
//! them, what part 99 asks of the flight in the pilot's words.

use crate::adiz::{leg_zones, zone_at, zone_name};
use wingtip_core::ask::{Ask, num_in, strings};
use wingtip_core::json::{self, Value};

/// Why it matters, as the Brief's line says under its tap (14 CFR 99.3).
const WHY: &str = "An ADIZ is airspace where every aircraft must be identified, located and controlled for national security.";

/// What part 99 asks in a zone, in the pilot's words, and the rules.
fn asks(zone: &str) -> (&'static str, &'static str) {
    match zone {
        // 99.9, 99.11, 99.13(b) and (c), 99.15(b); 99.1(b)(1)'s 10 nm.
        "contiguous" => (
            "File and open a DVFR or IFR flight plan with the time and place you cross, keep a listening watch, report before you cross, and squawk with altitude reporting. Within 10 nm of where it took off, only the transponder and the report.",
            "14 CFR 99.1(b)(1), 99.9, 99.11, 99.13, 99.15",
        ),
        // 99.1(b)(3): under 180 kt with a listening watch, only 99.7, 99.13, 99.15.
        "alaska" => (
            "Under 180 kt true airspeed with a listening watch on the frequency, only the transponder on and a position report before you cross; faster, a DVFR or IFR flight plan too.",
            "14 CFR 99.1(b)(3), 99.9, 99.11, 99.13, 99.15",
        ),
        // 99.1(b)(2): under 180 kt, or over or within 12 nm of an island.
        "hawaii" => (
            "Under 180 kt true airspeed, or over or within 12 nm of an island, only the transponder on and a position report before you cross; faster, a DVFR or IFR flight plan too.",
            "14 CFR 99.1(b)(2), 99.9, 99.11, 99.13, 99.15",
        ),
        // 99.1(b)(4): under 180 kt.
        _ => (
            "Under 180 kt true airspeed, only the transponder on and a position report before you cross; faster, a DVFR or IFR flight plan too.",
            "14 CFR 99.1(b)(4), 99.9, 99.11, 99.13, 99.15",
        ),
    }
}

/// "Through the Alaska ADIZ" for the zones met, in the order met.
fn lead(zones: &[&str]) -> Option<String> {
    let first = zones.first()?;
    let names = zones[1..].iter().fold(zone_name(first).to_owned(), |all, z| format!("{all} and {}", zone_name(z)));
    Some(format!("Through {names}"))
}

#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let points = ask
        .list("points")?
        .iter()
        .map(|p| Ok((num_in(name, p, "lat")?, num_in(name, p, "lon")?)))
        .collect::<Result<Vec<_>, String>>()?;
    let mut met: Vec<&str> = Vec::new();
    let mut add = |zones: &[&'static str]| {
        for z in zones {
            if !met.contains(z) {
                met.push(z);
            }
        }
    };
    let mut out = String::from("{\"points\":[");
    for (i, &(lat, lon)) in points.iter().enumerate() {
        let zone = zone_at(lat, lon);
        if i > 0 {
            out.push(',');
        }
        json::opt_string(&mut out, zone);
        // A single point's zone: a route of one point, or where it departs.
        add(&zone.into_iter().collect::<Vec<_>>());
    }
    out.push_str("],\"legs\":[");
    for (i, pair) in points.windows(2).enumerate() {
        let zones = leg_zones(pair[0], pair[1]);
        if i > 0 {
            out.push(',');
        }
        strings(&mut out, &zones.iter().map(|z| z.to_string()).collect::<Vec<_>>());
        add(&zones);
    }
    out.push_str("],\"zones\":");
    strings(&mut out, &met.iter().map(|z| z.to_string()).collect::<Vec<_>>());
    out.push_str(",\"brief\":");
    match lead(&met) {
        None => out.push_str("null"),
        Some(lead) => {
            // What the first zone met asks; the rest are said by name.
            let (act, cite) = asks(met[0]);
            out.push_str("{\"lead\":");
            json::string(&mut out, &lead);
            out.push_str(",\"line\":");
            json::string(&mut out, &format!("{lead}. {act}"));
            out.push_str(",\"action\":");
            json::string(&mut out, act);
            out.push_str(",\"why\":");
            json::string(&mut out, WHY);
            out.push_str(",\"cite\":");
            json::string(&mut out, cite);
            out.push('}');
        }
    }
    out.push('}');
    Ok(out)
}
