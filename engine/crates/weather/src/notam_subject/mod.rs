//! What one NOTAM addresses on an airport's card (`notam_subject`): the
//! field, a runway, a light, an approach, a frequency or the fuel, each
//! with a short word for its badge and how bad it is, read from the
//! NOTAM's own text by FAA Order JO 7930.2 (Notices to Air Missions) and
//! matched to the card's own rows. The owner, 2026-11-11: "For anything
//! the notam addresses, just put a badge next to it".
//!
//! Read strictly, as a wrong "Closed" on an open runway is a safety defect
//! and a missed one is no worse than today's list: the subject is the
//! NOTAM's keyword (1-2-1) and the words that follow it, never a runway
//! named anywhere in its text (a taxiway's "TWY A BTN RWY 09 AND TWY C
//! CLSD" closes the taxiway, not runway 09). Anything it cannot place is
//! no badge; the NOTAM is still in the card's list.
//!
//! - RWY (1-2-1), its runway first (3-3-5): CLSD straight after it
//!   closes it; CLSD EXC XNG or EXC TAX still closes it to landing and
//!   takeoff, said in the label; CLSD EXC PPR closes it to all but those
//!   with prior permission; CLSD TO (some aircraft) or EXC anything else
//!   restricts it; CLSD with a schedule (DLY, days, times) closes it at
//!   times; a part of it closed (a length, a compass point) is part
//!   closed; a light on it (RWY 27 PAPI U/S) is the light's and the
//!   runway's; anything else on it is a NOTAM on it.
//! - AD (1-2-1): AD AP CLSD closes the field, with the qualifiers as a
//!   runway's; its beacon, its fuel and its weather's broadcast (ATIS,
//!   AWOS, ASOS) as below; anything else no badge.
//! - NAV (1-2-1): an ILS, LOC, LDA or SDF by its runway (NAV ILS RWY 09 GP
//!   U/S) on the approaches that use it: the glide slope the ILS's, the
//!   localizer or the whole ILS the ILS's and the LOC's. A VOR or an NDB
//!   is no badge: which approaches use one the chart says, not its name.
//! - IAP (1-2-1, the FDC form of 7-1-3): the procedure its title names
//!   (after the field's name, "..., WI.", to its amendment), not available
//!   where it says PROCEDURE NA (not authorized, JO 7340.2), else changed.
//! - COM (1-2-1): the frequency by its MHz, else the facility by name
//!   (TWR, GND, ATIS, CTAF, UNICOM, AWOS, ASOS).
//! - SVC (1-2-1): fuel (FUEL or a grade) on the card's fuel row; a
//!   facility as COM's.
//! - The ICAO form (chapter 8): E) read as the domestic body, its subject
//!   from E)'s first word where that is a keyword, else the Q) code's
//!   (Appendix B: MR runway, FA aerodrome, I the ILS, L lighting, C
//!   communications, FU fuel).
//! - A TFR (the planner's kind "tfr", within 5 nm of the field): the
//!   field's "TFR".

mod answer;
pub(crate) mod parts;
#[cfg(test)]
mod tests;

use crate::notam_read::{self, bare, item};
pub use answer::call;
use parts::{condition, designations, facility, facility_is, is_fuel, lamp_is, lamp_of, mhz_of, runway_has, Lamp};

/// What a badge is next to: the card's field, or one of its rows by its
/// index in the list the card gave.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum On {
    Field,
    Runway(usize),
    Light(usize),
    Approach(usize),
    Frequency(usize),
    Fuel,
}

/// How bad: closed or not to be used, or one to read before using it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Severity {
    Unusable,
    Caution,
}

#[derive(Debug, PartialEq)]
pub struct Badge {
    pub on: On,
    pub word: &'static str,
    pub severity: Severity,
    /// What it says, for the badge's label: the NOTAM's words (notam_read)
    /// where they say it, else what the closure leaves open.
    pub label: String,
}

/// A light on the card (lighting_read's): its legend code, its name, the
/// runways or ends it serves.
#[derive(Debug, Default)]
pub struct CardLight {
    pub code: Option<String>,
    pub name: String,
    pub runways: Vec<String>,
}

/// What the card lists, each in its order: the badges point at them by it.
#[derive(Debug, Default)]
pub struct Card {
    pub idents: Vec<String>,
    pub runways: Vec<String>,
    pub lights: Vec<CardLight>,
    pub approaches: Vec<String>,
    /// Each frequency's type ("TWR", "AWOS-3") and MHz.
    pub frequencies: Vec<(Option<String>, Option<f64>)>,
}

const KEYWORDS: &str = "RWY TWY APRON AD OBST NAV COM SVC AIRSPACE ODP SID STAR CHART DATA DVA IAP VFP ROUTE SPECIAL SECURITY";

/// A word as compared: its stops and brackets off.
fn word(w: &str) -> String {
    bare(w).to_owned()
}

/// The domestic form's start-and-end (YYMMDDHHMM, 3-3-2), where its body
/// stops.
fn is_window(w: &str) -> bool {
    w.len() >= 10 && w.as_bytes()[..10].iter().all(u8::is_ascii_digit)
}

/// The keyword, the words after it, and its text after it as sent (an
/// IAP's title is read from that, commas and all).
pub(crate) fn subject_of(text: &str) -> Option<(String, Vec<String>, String)> {
    if text.contains("Q)") || text.contains("E)") {
        let e = item(text, b'E')?;
        let words: Vec<String> = e.split_whitespace().map(word).collect();
        if let Some(first) = words.first().filter(|w| KEYWORDS.split(' ').any(|k| k == w.as_str())) {
            return Some((first.clone(), words[1..].to_vec(), e[e.find(first.as_str())? + first.len()..].to_owned()));
        }
        // JO 7930.2 Appendix B: the Q) code's second and third letters.
        let code = item(text, b'Q')?.split('/').nth(1)?.get(1..3)?;
        let keyword = match (code, &code[..1]) {
            ("MR", _) => "RWY",
            ("FA", _) => "AD",
            ("FU", _) => "SVC",
            (_, "I") => "NAV",
            (_, "L") => "LGT",
            (_, "C") => "COM",
            _ => return None,
        };
        return Some((keyword.to_owned(), words, e.to_owned()));
    }
    let raw: Vec<&str> = text.split_whitespace().collect();
    // "!ACCOUNT NUMBER LOCATION" (4-2-1) before the keyword.
    let start = if raw.first().is_some_and(|w| w.starts_with('!')) { 3 } else { 0 };
    let k = (start..raw.len()).find(|&i| KEYWORDS.split(' ').any(|kw| kw == bare(raw[i])))?;
    let end = (k + 1..raw.len()).find(|&i| is_window(raw[i])).unwrap_or(raw.len());
    let after = text.find(raw[k]).map(|at| &text[at + raw[k].len()..]).unwrap_or("");
    Some((word(raw[k]), raw[k + 1..end].iter().map(|w| word(w)).collect(), after.to_owned()))
}

/// A closure's words after CLSD, read for what it leaves: the word, how
/// bad, and a label of its own where the NOTAM's words would not say it
/// at a glance.
fn closure(after: &[String]) -> (&'static str, Severity, Option<&'static str>) {
    let first = after.first().map(String::as_str);
    let exc: Vec<&str> = after.iter().skip(1).map(String::as_str).collect();
    let schedule = |w: &str| {
        matches!(w, "DLY" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" | "SR-SS" | "EVERY" | "NGT")
            || w.split(['-', '–']).count() == 2 && w.split(['-', '–']).all(|t| t.len() == 4 && t.bytes().all(|b| b.is_ascii_digit()))
            || w.contains("-FRI")
            || w.contains("-SUN")
            || w.contains("-SAT")
    };
    match first {
        None => ("Closed", Severity::Unusable, None),
        // EXC XNG, EXC TAX (TBL 3-3-1): closed to landing and takeoff
        // still, open to cross or taxi on.
        Some("EXC") if !exc.is_empty() && exc.iter().all(|w| matches!(*w, "XNG" | "TAX" | "TO" | "AND" | "TAXI")) => {
            ("Closed", Severity::Unusable, Some("Still closed to landing and takeoff."))
        }
        Some("EXC") if exc.first() == Some(&"PPR") => ("Closed", Severity::Unusable, Some("Closed to all without prior permission.")),
        Some("EXC" | "TO") => ("Restricted", Severity::Caution, None),
        Some(w) if schedule(w) => ("Closed at times", Severity::Caution, None),
        Some(_) => ("Closed", Severity::Unusable, None),
    }
}

fn badge(out: &mut Vec<Badge>, on: On, word: &'static str, severity: Severity, label: &str) {
    out.push(Badge { on, word, severity, label: label.to_owned() });
}

/// A runway's NOTAM (RWY), its designation the first of `body`.
fn runway(body: &[String], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let (ends, used) = designations(body);
    let rest = &body[used..];
    let rows: Vec<usize> = (0..card.runways.len()).filter(|&i| runway_has(&card.runways[i], &ends)).collect();
    if let Some(lamp) = lamp_of(rest) {
        lights(lamp, &ends, rest, card, label, out);
        rows.iter().for_each(|&i| badge(out, On::Runway(i), "NOTAM", Severity::Caution, label));
        return;
    }
    let clsd = rest.iter().position(|w| w == "CLSD");
    let (w, severity, own) = match clsd {
        Some(0) => closure(&rest[1..]),
        // A length or a part of it closed ("N 1000FT CLSD", "FIRST 1000FT").
        Some(at)
            if rest[..at].iter().any(|w| w.ends_with("FT") || crate::contractions::compass(w).is_some() || w == "FIRST" || w == "LAST") =>
        {
            ("Part closed", Severity::Caution, None)
        }
        _ => (if condition(rest) == Some("Changed") { "Changed" } else { "NOTAM" }, Severity::Caution, None),
    };
    let label = own.map_or_else(|| label.to_owned(), |o| [label, " ", o].concat());
    rows.iter().for_each(|&i| badge(out, On::Runway(i), w, severity, &label));
}

/// A light's NOTAM: each of the card's lights of its kind on its runway
/// (one with no runway named is the beacon alone's).
fn lights(lamp: Lamp, ends: &[String], rest: &[String], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let w = condition(rest).unwrap_or("NOTAM");
    for (i, l) in card.lights.iter().enumerate() {
        let served = l.runways.iter().filter_map(|r| parts::ends_of(r)).flatten().any(|e| ends.contains(&e));
        if lamp_is(lamp, l.code.as_deref(), &l.name) && (lamp == Lamp::Beacon || served) {
            badge(out, On::Light(i), w, Severity::Caution, label);
        }
    }
}

/// The field's NOTAM (AD), "AP" first where it is the airport's.
fn aerodrome(body: &[String], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let body = if body.first().is_some_and(|w| w == "AP") { &body[1..] } else { body };
    match body.first().map(String::as_str) {
        Some("CLSD") => {
            let (w, severity, own) = closure(&body[1..]);
            badge(out, On::Field, w, severity, &own.map_or_else(|| label.to_owned(), |o| [label, " ", o].concat()));
        }
        Some("RWY") => runway(&body[1..], card, label, out),
        _ if is_fuel(body) => badge(out, On::Fuel, condition(body).unwrap_or("NOTAM"), Severity::Caution, label),
        _ if lamp_of(body) == Some(Lamp::Beacon) => lights(Lamp::Beacon, &[], body, card, label, out),
        _ => facilities(body, &["ATIS", "AWOS", "ASOS"], card, label, out),
    }
}

/// The card's frequencies of the facilities `body` names, of `only`
/// where given.
fn facilities(body: &[String], only: &[&str], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let w = condition(body).unwrap_or("NOTAM");
    let named: Vec<&[&str]> = body.iter().filter(|b| only.is_empty() || only.contains(&b.as_str())).filter_map(|b| facility(b)).collect();
    for (i, (kind, _)) in card.frequencies.iter().enumerate() {
        if kind.as_deref().is_some_and(|k| named.iter().any(|types| facility_is(types, k))) {
            badge(out, On::Frequency(i), w, Severity::Caution, label);
        }
    }
}

/// A frequency's NOTAM (COM): by its MHz, else its facility.
fn communications(body: &[String], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let w = condition(body).unwrap_or("NOTAM");
    let said: Vec<f64> = body.iter().filter_map(|b| mhz_of(b)).collect();
    let before = out.len();
    for (i, (_, mhz)) in card.frequencies.iter().enumerate() {
        if mhz.is_some_and(|m| said.iter().any(|s| (s - m).abs() < 0.0005)) {
            badge(out, On::Frequency(i), w, Severity::Caution, label);
        }
    }
    if out.len() == before {
        facilities(body, &[], card, label, out);
    }
}

/// An ILS, LOC, LDA or SDF's NOTAM (NAV), on the approaches that use it.
fn navaid(body: &[String], card: &Card, label: &str, out: &mut Vec<Badge>) {
    let Some(at) = body.iter().position(|w| matches!(w.as_str(), "ILS" | "LOC" | "LDA" | "SDF")) else { return };
    if body.get(at + 1).is_none_or(|w| w != "RWY") {
        return;
    }
    let (ends, used) = designations(&body[at + 2..]);
    let part = body.get(at + 2 + used).map(String::as_str).unwrap_or("");
    let kind = body[at].as_str();
    // Which of a chart's navaid words it takes out: the glide slope the
    // ILS alone (its LOC minimums stand); the localizer, or the ILS whole,
    // the ILS and the LOC; another part (a marker, the DME) the ILS's.
    let whole = part.is_empty() || matches!(part, "U/S" | "OTS" | "UNSERVICEABLE" | "INOP" | "NOT" | "UNAVBL" | "NA");
    let charts: &[&str] = match (kind, part) {
        ("ILS", "GP" | "GS" | "GLIDESLOPE") => &["ILS"],
        ("ILS", "LOC") | ("LOC", _) => &["ILS", "LOC"],
        ("ILS", _) if whole => &["ILS", "LOC"],
        ("ILS", _) => &["ILS"],
        ("LDA", _) => &["LDA"],
        _ => &["SDF"],
    };
    let w = condition(body).unwrap_or("NOTAM");
    for (i, chart) in card.approaches.iter().enumerate() {
        let (rwy, words) = parts::chart_parts(chart);
        // A back course flies the far end's localizer: not guessed at.
        let uses = !words.iter().any(|w| w == "BC") && words.iter().any(|w| charts.contains(&w.as_str()));
        if uses && !ends.is_empty() && rwy == ends {
            badge(out, On::Approach(i), w, Severity::Caution, label);
        }
    }
}

/// An approach's FDC NOTAM (IAP, 7-1-3): "IAP WITTMAN RGNL, OSHKOSH, WI.
/// RNAV (GPS) RWY 36, AMDT 2... <change>".
fn approach(after: &str, card: &Card, label: &str, out: &mut Vec<Badge>) {
    let Some(name_end) = after.match_indices(". ").map(|(i, _)| i).find(|&i| !after[..i].ends_with('.')) else { return };
    let rest = &after[name_end + 2..];
    let Some((title, change)) = rest.split_once(',') else { return };
    let title = parts::title_words(title);
    let words: Vec<String> = change.split_whitespace().map(word).collect();
    let na = words.windows(2).any(|p| p[0] == "PROCEDURE" && p[1] == "NA");
    let (w, severity) = if na { ("Not authorized", Severity::Unusable) } else { ("Changed", Severity::Caution) };
    for (i, chart) in card.approaches.iter().enumerate() {
        if parts::same_procedure(chart, &title) {
            badge(out, On::Approach(i), w, severity, label);
        }
    }
}

/// What the NOTAM addresses on the card: its badges, none where it cannot
/// be placed. `tfr` is the planner's kind "tfr".
pub fn subject(text: &str, tfr: bool, card: &Card) -> Vec<Badge> {
    let mut out = Vec::new();
    if tfr {
        badge(&mut out, On::Field, "TFR", Severity::Caution, "Temporary flight restriction near the field");
        return out;
    }
    let text = text.trim();
    // Lower case is someone's own writing (notam_read): not read for this.
    if text.bytes().any(|b| b.is_ascii_lowercase()) {
        return out;
    }
    let Some((keyword, body, after)) = subject_of(text) else { return out };
    let label = notam_read::read(text, &card.idents).words;
    match keyword.as_str() {
        "RWY" => runway(&body, card, &label, &mut out),
        "AD" => aerodrome(&body, card, &label, &mut out),
        "NAV" => navaid(&body, card, &label, &mut out),
        "IAP" => approach(&after, card, &label, &mut out),
        "COM" => communications(&body, card, &label, &mut out),
        "SVC" if is_fuel(&body) => badge(&mut out, On::Fuel, condition(&body).unwrap_or("NOTAM"), Severity::Caution, &label),
        "SVC" => facilities(&body, &[], card, &label, &mut out),
        // The ICAO form's lighting (Q) L..): "PAPI RWY 27 U/S".
        "LGT" => {
            let ends = body.iter().position(|w| w == "RWY").map(|i| designations(&body[i + 1..]).0).unwrap_or_default();
            if let Some(lamp) = lamp_of(&body) {
                lights(lamp, &ends, &body, card, &label, &mut out);
            }
        }
        _ => {}
    }
    out
}
