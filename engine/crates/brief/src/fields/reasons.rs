//! Each ranked field's reasons, a line each, toned as the Brief's
//! findings are ("ok", "caution", "stop"): what was weighed, so a pilot
//! sees why a field is where it is in the list and decides.

use super::{Mode, Ranked, Reach};
use crate::airport_use::Use;
use crate::figures::words::grouped;
use crate::runway::pick::runway_number;

type Reason = (&'static str, String);

pub fn of(mode: Mode, r: &Ranked) -> Vec<Reason> {
    let mut out = vec![];
    // Not known (no glide figures, no altitude): said once over the list
    // (needs_airplane), not on every row.
    if mode == Mode::Glide && r.reach != Reach::Unknown {
        out.push(reach(r));
    }
    out.extend(runway(r));
    if let Some(category) = r.field.flight_category.as_deref() {
        match category {
            "IFR" | "LIFR" => out.push(("caution", format!("{category} at the field"))),
            _ => out.push(("ok", format!("{category} at the field"))),
        }
    }
    // Landed at only with leave in the ordinary way; in an emergency the
    // pilot in command may deviate from any rule to meet it (14 CFR
    // 91.3(b)), so in a glide it is said, never left out, and in a
    // diversion it is the card's line (airport_use), the permission
    // standing. A joint-use field is public use: nothing to say.
    match (mode, r.field.usage) {
        (Mode::Glide, Use::Military) => out.push(("caution", "Military field: tell ATC you are landing there".to_owned())),
        (Mode::Glide, Use::Private) => out.push(("caution", "Private field: its owner's permission, unless it's an emergency".to_owned())),
        (Mode::Diversion, u) => out.extend(u.card_words().map(|w| ("caution", w.to_owned()))),
        _ => {}
    }
    out
}

fn reach(r: &Ranked) -> Reason {
    match (r.reach, r.arrive_agl_ft, r.reach_nm) {
        (Reach::Within, Some(agl), _) => ("ok", format!("Within glide: over the field at about {} ft", grouped(round_to(agl, 100.0)))),
        (Reach::Low, Some(agl), _) => {
            ("caution", format!("Reachable low: about {} ft over the field, under pattern height", grouped(round_to(agl, 100.0))))
        }
        (Reach::Beyond, _, Some(nm)) if nm > 0.0 => ("stop", format!("Beyond glide: about {:.1} nm short", (r.distance_nm - nm).max(0.1))),
        _ => ("stop", "Beyond glide".to_owned()),
    }
}

fn runway(r: &Ranked) -> Vec<Reason> {
    let Some(e) = &r.end else {
        return vec![("stop", "No open runway listed".to_owned())];
    };
    let mut out = vec![];
    let length = e.fit.length_ft.map_or_else(|| "length not listed".to_owned(), |l| format!("{} ft", grouped(l)));
    let surface = e.surface.as_deref().map_or(String::new(), |s| format!(" {}", surface_word(s)));
    let wind = match e.headwind_kt.map(f64::round) {
        Some(h) if h < 0.0 => format!(", {} kt tailwind", -h),
        Some(h) if h > 0.0 => format!(", {h} kt headwind"),
        _ => String::new(),
    };
    let crosswind = if e.fit.crosswind_kt > 0.0 { format!(", {} kt crosswind", e.fit.crosswind_kt) } else { String::new() };
    out.push(("ok", format!("Runway {}: {length}{surface}{wind}{crosswind}", runway_number(&e.end))));
    match (e.fit.needed_ft, e.fit.length_ft) {
        (Some(need), Some(have)) if e.fit.short => {
            out.push(("stop", format!("Short: the POH's landing needs about {} ft over 50 ft, {} ft listed", grouped(need), grouped(have))))
        }
        (Some(need), Some(_)) if e.fit.close => {
            out.push(("caution", format!("Close: the POH's landing needs about {} ft, under 15% to spare", grouped(need))))
        }
        (Some(need), Some(_)) => out.push(("ok", format!("The POH's landing needs about {} ft over 50 ft", grouped(need)))),
        _ => {}
    }
    if e.fit.crosswind_over {
        out.push(("caution", format!("Crosswind {} kt, past the demonstrated", e.fit.crosswind_kt)));
    }
    out
}

/// A surface as OurAirports codes it ("ASPH-G", "CON", "GRS", "TURF-F")
/// in a word: its first material, the condition after the dash left out;
/// a code not known here as sent.
fn surface_word(code: &str) -> String {
    let first = code.split(['-', '/', ' ']).next().unwrap_or(code).to_uppercase();
    match first.as_str() {
        "ASP" | "ASPH" | "ASPHALT" | "BIT" => "asphalt".to_owned(),
        "CON" | "CONC" | "CONCRETE" | "PEM" => "concrete".to_owned(),
        "TURF" | "GRS" | "GRASS" | "SOD" => "turf".to_owned(),
        "GRVL" | "GRAVEL" | "GRV" => "gravel".to_owned(),
        "DIRT" => "dirt".to_owned(),
        "WATER" | "WAT" => "water".to_owned(),
        _ => code.to_owned(),
    }
}

fn round_to(n: f64, step: f64) -> f64 {
    (n / step).round() * step
}
