//! A NOTAM's title (notam_read's `title`): the thing it is about, named by
//! the words straight after its keyword (FAA Order JO 7930.2 1-2-1), as
//! notam_subject reads them -- "Runway 06/24", "Taxiway A", "ILS runway
//! 09", "Fuel 100LL", "Tower 120.75" -- where the heading alone says only
//! the keyword ("Runway"). The owner, 2026-11-11: "the notam title can be
//! a bit more specific". Only what those words say; None where they name
//! nothing it knows, and the heading is the title.

use super::body::is_taxiway;
use crate::contractions::written;
use crate::notam_subject::parts::{designations, is_fuel, lamp_of, mhz_of};
use crate::notam_subject::subject_of;

/// A list as a title says it: "B", "B and C", "B, C and D".
pub(super) fn listed(items: &[&str]) -> String {
    match items {
        [] => String::new(),
        [one] => (*one).to_owned(),
        [rest @ .., last] => [rest.join(", ").as_str(), " and ", last].concat(),
    }
}

/// The runways designated first in `body` as the NOTAM writes them (3-3-5):
/// "Runway 06/24", "Runways 09/27 and 18/36"; with a light named straight
/// after, the light's code too ("Runway 27 PAPI").
fn runway(body: &[String]) -> Option<String> {
    let (_, used) = designations(body);
    let named: Vec<&str> = body[..used].iter().map(String::as_str).filter(|w| *w != "AND").collect();
    if named.is_empty() {
        return None;
    }
    let mut t = [if named.len() > 1 { "Runways " } else { "Runway " }, &listed(&named)].concat();
    if let Some(next) = body.get(used)
        && lamp_of(std::slice::from_ref(next)).is_some()
        && !matches!(next.as_str(), "EDGE")
    {
        t.push(' ');
        t.push_str(next);
    }
    Some(t)
}

/// The taxiways designated first (3-3-6): "Taxiway A", "Taxiways B and C".
fn taxiway(body: &[String]) -> Option<String> {
    let named: Vec<&str> = body.iter().map(String::as_str).take_while(|w| *w == "AND" || is_taxiway(w)).filter(|w| *w != "AND").collect();
    (!named.is_empty()).then(|| [if named.len() > 1 { "Taxiways " } else { "Taxiway " }, &listed(&named)].concat())
}

/// The fuel and its grades as written: "Fuel 100LL", "Fuel Jet A".
fn fuel(body: &[String]) -> String {
    let mut grades: Vec<&str> = Vec::new();
    for (i, w) in body.iter().enumerate() {
        let grade = match w.as_str() {
            "100LL" | "MOGAS" | "UL94" | "94UL" | "UL91" | "91UL" => w.as_str(),
            "JETA" | "JET-A" => "Jet A",
            "JET" if body.get(i + 1).is_some_and(|n| n == "A") => "Jet A",
            "JET" if body.get(i + 1).is_some_and(|n| n == "A1" || n == "A-1") => "Jet A-1",
            _ => continue,
        };
        if !grades.contains(&grade) {
            grades.push(grade);
        }
    }
    if grades.is_empty() {
        "Fuel".to_owned()
    } else {
        ["Fuel ", &listed(&grades)].concat()
    }
}

/// A facility named by its contraction (JO 7340.2) as a pilot calls it.
fn facility(w: &str) -> Option<&'static str> {
    match w {
        "TWR" | "ATCT" => Some("Tower"),
        "GND" => Some("Ground"),
        "CD" => Some("Clearance delivery"),
        "APP" => Some("Approach"),
        "DEP" => Some("Departure"),
        "ATIS" => Some("ATIS"),
        "CTAF" => Some("CTAF"),
        "UNICOM" => Some("UNICOM"),
        "AWOS" => Some("AWOS"),
        "ASOS" => Some("ASOS"),
        _ => None,
    }
}

/// A frequency's NOTAM (COM): its facility and its MHz, "Tower 120.75",
/// either alone where only one is said.
fn communications(body: &[String]) -> Option<String> {
    let name = body.iter().find_map(|w| facility(w));
    let mhz = body.iter().find(|w| mhz_of(w).is_some()).map(String::as_str);
    match (name, mhz) {
        (Some(n), Some(m)) => Some([n, " ", m].concat()),
        (Some(n), None) => Some(n.to_owned()),
        (None, Some(m)) => Some(["Frequency ", m].concat()),
        _ => None,
    }
}

/// A navaid's NOTAM (NAV): an ILS's part by its runway, "Glide slope
/// runway 09", "ILS runway 09"; else a navaid by its ident and kind, "OSH
/// VOR".
fn navaid(body: &[String]) -> Option<String> {
    let kind = body.first()?.as_str();
    if matches!(kind, "ILS" | "LOC" | "LDA" | "SDF") && body.get(1).is_some_and(|w| w == "RWY") {
        let rwy = body.get(2).filter(|d| designations(std::slice::from_ref(*d)).1 == 1)?;
        let part = match body.get(3).map(String::as_str) {
            Some("GP" | "GS" | "GLIDESLOPE") => "Glide slope",
            Some("LOC") if kind == "ILS" => "Localizer",
            Some("DME") => return Some([kind, " DME runway ", rwy].concat()),
            _ => kind,
        };
        return Some([part, " runway ", rwy].concat());
    }
    let kinds = "VOR VORTAC VOR/DME TACAN NDB DME";
    let second = body.get(1)?;
    (kinds.split(' ').any(|k| k == second) && body[0].len() <= 5 && body[0].bytes().all(|b| b.is_ascii_uppercase()))
        .then(|| [body[0].as_str(), " ", second].concat())
}

/// An FDC approach NOTAM's procedure (7-1-3), as the plate prints it: the
/// words after the field's name ("..., WI.") to its amendment ("RNAV (GPS)
/// RWY 36").
fn approach(after: &str) -> Option<String> {
    let end = after.match_indices(". ").map(|(i, _)| i).find(|&i| !after[..i].ends_with('.'))?;
    let (title, _) = after[end + 2..].split_once(',')?;
    // One space between its words, as the plate prints it: the feed's
    // "RNAV (GPS)  RWY 4R" has two.
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    (!title.is_empty() && title.len() <= 40).then_some(title)
}

/// An obstacle's kind, its first word ("OBST CRANE ..."): "Obstacle: crane".
fn obstacle(body: &[String]) -> Option<String> {
    let w = body.first()?;
    if w.len() < 3 || !w.bytes().all(|b| b.is_ascii_uppercase()) {
        return None;
    }
    Some(["Obstacle: ", &written(w).map_or_else(|| w.to_ascii_lowercase(), str::to_owned)].concat())
}

/// The field's NOTAM (AD), "AP" first where it is the airport's.
fn aerodrome(body: &[String]) -> Option<String> {
    let body = if body.first().is_some_and(|w| w == "AP") { &body[1..] } else { body };
    match body.first().map(String::as_str)? {
        "CLSD" => Some("Aerodrome closed".to_owned()),
        "RWY" => runway(&body[1..]),
        "BCN" | "ABN" => Some("Aerodrome beacon".to_owned()),
        "ATIS" | "AWOS" | "ASOS" => facility(&body[0]).map(str::to_owned),
        _ if is_fuel(body) => Some(fuel(body)),
        _ => None,
    }
}

/// The title of the NOTAM's `text`, as sent; None where its words name no
/// thing this knows.
pub(super) fn title(text: &str) -> Option<String> {
    let (keyword, body, after) = subject_of(text)?;
    match keyword.as_str() {
        "RWY" => runway(&body),
        "TWY" => taxiway(&body),
        "APRON" => body.first().filter(|w| is_taxiway(w)).map(|w| ["Apron ", w].concat()),
        "AD" => aerodrome(&body),
        "NAV" => navaid(&body),
        "IAP" => approach(&after),
        "OBST" => obstacle(&body),
        "COM" => communications(&body),
        "SVC" if is_fuel(&body) => Some(fuel(&body)),
        "SVC" => body.first().and_then(|w| facility(w)).map(str::to_owned),
        _ => None,
    }
}
