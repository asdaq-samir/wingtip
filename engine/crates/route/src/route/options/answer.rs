//! Route options' answer written out (the contract's RouteOptionsAnswer):
//! the ways, their paths and what each meets. With no airplane a way's
//! minutes in the air and its fuel are null: they need one.

use super::grid::Hazard;
use super::ways::Along;
use super::words::r5;
use super::Way;
use crate::json;
use wingtip_core::grid::Point;

pub fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

pub fn ints(out: &mut String, items: &[i64]) {
    out.push('[');
    for (i, n) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&n.to_string());
    }
    out.push(']');
}

pub fn path_json(out: &mut String, path: &[Point]) {
    out.push('[');
    for (i, p) in path.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        json::number(out, r5(p.0));
        out.push(',');
        json::number(out, r5(p.1));
        out.push(']');
    }
    out.push(']');
}

pub fn along_json(out: &mut String, a: &Along) {
    out.push_str("\"bands\":[");
    for (i, (kind, min)) in a.bands.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&format!("{{\"kind\":\"{kind}\",\"min\":"));
        json::number(out, *min);
        out.push('}');
    }
    out.push_str("],\"tail_kt\":");
    json::number(out, a.tail_kt);
    out.push_str(&format!(",\"floor_ft\":{},\"water_nm\":{}", a.floor_ft, a.water_nm));
}

pub fn way_json(out: &mut String, w: &Way, airplane: bool, hazards: &[Hazard]) {
    out.push_str("{\"kind\":");
    json::string(out, &w.kind);
    out.push_str(",\"kinds\":");
    strings(out, &w.kinds);
    out.push_str(",\"title\":");
    json::string(out, &w.title);
    out.push_str(",\"stops\":");
    strings(out, &w.stops);
    out.push_str(",\"fuel\":");
    strings(out, &w.fuel);
    out.push_str(",\"food\":");
    strings(out, &w.food);
    out.push_str(",\"path\":");
    path_json(out, &w.path);
    for (key, v) in [
        ("distance_nm", Some(w.distance_nm)),
        ("air_min", airplane.then_some(w.air_min)),
        ("ground_min", Some(w.ground_min)),
        ("fuel_gal", airplane.then_some(w.fuel_gal)),
    ] {
        out.push_str(&format!(",\"{key}\":"));
        match v {
            Some(v) => json::number(out, v),
            None => out.push_str("null"),
        }
    }
    out.push_str(&format!(",\"landings\":{}", w.landings));
    out.push_str(",\"crosses\":");
    ints(out, &w.crosses);
    out.push_str(",\"marginal\":");
    ints(out, &w.marginal);
    // The card's one warning, in the engine's words (special_use.rs).
    out.push_str(",\"warning\":");
    json::opt_string(out, super::special_use::way_warning(hazards, &w.crosses));
    out.push(',');
    along_json(out, &w.along);
    out.push('}');
}
