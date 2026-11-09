//! The draft entry as the engine's answer: JSON, the entry's columns in
//! the gateway's LogbookEntry camelCase, the rest snake_case as the
//! engine's answers are (engine/contract/engine.schema.json).

use super::entry::{Draft, Event};
use wingtip_core::json;

fn key(out: &mut String, k: &str) {
    if !out.ends_with('{') {
        out.push(',');
    }
    json::string(out, k);
    out.push(':');
}

fn num(out: &mut String, k: &str, v: f64) {
    key(out, k);
    json::number(out, v);
}

fn flag(out: &mut String, k: &str, v: bool) {
    key(out, k);
    out.push_str(if v { "true" } else { "false" });
}

fn text(out: &mut String, k: &str, v: Option<&str>) {
    key(out, k);
    json::opt_string(out, v);
}

fn events_json(out: &mut String, k: &str, events: &[Event]) {
    key(out, k);
    out.push('[');
    for (i, e) in events.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('{');
        num(out, "t", e.t);
        num(out, "lat", e.lat);
        num(out, "lon", e.lon);
        text(out, "field", e.field.as_deref());
        flag(out, "towered", e.towered);
        if !e.kind.is_empty() {
            text(out, "kind", Some(e.kind));
            flag(out, "counts_night", e.counts_night);
        }
        flag(out, "night", e.night);
        flag(out, "passenger_night", e.passenger_night);
        out.push('}');
    }
    out.push(']');
}

/// The draft as JSON: `{"entry", "instrument", "takeoffs", "landings",
/// "approaches", "holds", "block", "cross_country", "ends_airborne",
/// "reasons"}`.
pub fn draft_json(d: &Draft) -> String {
    let e = &d.entry;
    let mut out = String::from("{");
    key(&mut out, "entry");
    out.push('{');
    text(&mut out, "flownOn", Some(&e.flown_on));
    text(&mut out, "aircraft", e.aircraft.as_deref());
    text(&mut out, "aircraftType", e.aircraft_type.as_deref());
    text(&mut out, "route", Some(&e.route));
    num(&mut out, "totalHours", e.total_hours);
    num(&mut out, "airHours", e.air_hours);
    num(&mut out, "nightHours", e.night_hours);
    num(&mut out, "crossCountryHours", e.cross_country_hours);
    num(&mut out, "dayLandings", e.day_landings as f64);
    num(&mut out, "nightLandings", e.night_landings as f64);
    num(&mut out, "touchAndGoes", e.touch_and_goes as f64);
    num(&mut out, "toweredLandings", e.towered_landings as f64);
    num(&mut out, "distanceNm", e.distance_nm);
    num(&mut out, "longestLegNm", e.longest_leg_nm);
    num(&mut out, "approaches", 0.0);
    flag(&mut out, "holding", false);
    flag(&mut out, "tracking", false);
    text(&mut out, "remarks", Some(&e.remarks));
    out.push('}');
    // What 61.57(c) counts, to add where it was flown by instruments.
    key(&mut out, "instrument");
    out.push('{');
    num(&mut out, "approaches", d.approaches.len() as f64);
    flag(&mut out, "holding", !d.holds.is_empty());
    flag(&mut out, "tracking", d.tracking);
    out.push('}');
    events_json(&mut out, "takeoffs", &d.takeoffs);
    events_json(&mut out, "landings", &d.landings);
    key(&mut out, "approaches");
    out.push('[');
    for (i, a) in d.approaches.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('{');
        text(&mut out, "airport", Some(&a.airport));
        text(&mut out, "id", Some(&a.id));
        text(&mut out, "name", Some(&a.name));
        num(&mut out, "faf_at", a.faf_at);
        text(&mut out, "outcome", Some(a.outcome.key()));
        key(&mut out, "also_fits");
        out.push('[');
        for (k, n) in a.also_fits.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            json::string(&mut out, n);
        }
        out.push_str("]}");
    }
    out.push(']');
    key(&mut out, "holds");
    out.push('[');
    for (i, (h, (from, to))) in d.holds.iter().zip(&d.holds_at).enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('{');
        num(&mut out, "from", *from);
        num(&mut out, "to", *to);
        num(&mut out, "racetracks", (h.turns / 2).max(1) as f64);
        num(&mut out, "lat", h.lat);
        num(&mut out, "lon", h.lon);
        text(&mut out, "fix", h.fix.as_deref());
        out.push('}');
    }
    out.push(']');
    key(&mut out, "block");
    out.push('{');
    key(&mut out, "from");
    json::opt_number(&mut out, d.block_from);
    key(&mut out, "to");
    json::opt_number(&mut out, d.block_to);
    out.push('}');
    key(&mut out, "cross_country");
    out.push('{');
    flag(&mut out, "landed_elsewhere", d.landed_elsewhere);
    flag(&mut out, "over_50_nm", d.over_50_nm);
    num(&mut out, "farthest_nm", (d.farthest_nm * 10.0).round() / 10.0);
    out.push('}');
    flag(&mut out, "ends_airborne", d.ends_airborne);
    key(&mut out, "reasons");
    out.push('[');
    for (i, r) in d.reasons.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('{');
        text(&mut out, "item", Some(r.item));
        text(&mut out, "says", Some(&r.says));
        text(&mut out, "source", Some(r.source));
        out.push('}');
    }
    out.push_str("]}");
    out
}
