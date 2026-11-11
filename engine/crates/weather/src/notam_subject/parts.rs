//! The pieces of a NOTAM's words the subject is read by (notam_subject):
//! runways as designated, the lights, a condition's word, a frequency, a
//! facility, a fuel and an approach's title. Each is read strictly; a word
//! that is none of them is none, never the nearest.

use crate::contractions::compass;

/// A runway's ends as designated (FAA Order JO 7930.2 3-3-5: "RWY 18/36",
/// "RWY 01L/19R", one end "RWY 27", or by the compass where it has no
/// number, "RWY NE/SW"), each written without its leading zero ("09L" is
/// "9L"), so the card's "9/27" and a NOTAM's "09/27" are one runway. None
/// where `word` is not a designation: a number over 36, a taxiway's "B3".
pub fn ends_of(word: &str) -> Option<Vec<String>> {
    let pair = word.contains('/');
    word.split('/')
        .map(|end| {
            let digits = end.trim_end_matches(['L', 'R', 'C']);
            let side = &end[digits.len()..];
            match digits.parse::<u8>() {
                Ok(n) if (1..=36).contains(&n) && digits.len() <= 2 && side.len() <= 1 => Some(format!("{n}{side}")),
                _ if pair && compass(end).is_some() => Some(end.to_owned()),
                _ => None,
            }
        })
        .collect()
}

/// The runways designated at the start of `words` ("09/27", "09/27 AND
/// 18/36"), their ends together, and how many words they took.
pub fn designations(words: &[String]) -> (Vec<String>, usize) {
    let mut ends: Vec<String> = Vec::new();
    let mut used = 0;
    while let Some(w) = words.get(used) {
        if let Some(e) = ends_of(w) {
            ends.extend(e);
            used += 1;
        } else if w == "AND" && !ends.is_empty() && words.get(used + 1).and_then(|n| ends_of(n)).is_some() {
            used += 1;
        } else {
            break;
        }
    }
    (ends, used)
}

/// Whether a card's runway ("09/27") is one of `ends`: the NOTAM's runway,
/// or one of its ends ("RWY 27" is runway 09/27's).
pub fn runway_has(card: &str, ends: &[String]) -> bool {
    ends_of(card).is_some_and(|own| !ends.is_empty() && ends.iter().all(|e| own.contains(e)))
}

/// What a NOTAM's condition says, in the badge's word (the conditions of
/// JO 7930.2 TBL 3-3-1, as crate::contractions writes them out): CLSD
/// "Closed"; U/S and OTS "Out of service"; NOT AVBL and UNAVBL "Not
/// available"; NA "Not authorized" (JO 7340.2); CHANGED "Changed". None where it says none of them.
pub fn condition(words: &[String]) -> Option<&'static str> {
    words.iter().enumerate().find_map(|(i, w)| match w.as_str() {
        "CLSD" => Some("Closed"),
        "U/S" | "OTS" | "UNSERVICEABLE" | "INOP" => Some("Out of service"),
        "UNAVBL" => Some("Not available"),
        "NA" => Some("Not authorized"),
        "NOT" if words.get(i + 1).is_some_and(|n| n == "AVBL") => Some("Not available"),
        "CHANGED" | "CHG" | "CHGD" => Some("Changed"),
        _ => None,
    })
}

/// A kind of light a NOTAM names (the Chart Supplement legend's codes,
/// AIM 2-1, which the card's lights are named by: lighting_read).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Lamp<'a> {
    Papi,
    Vasi,
    Reil,
    /// An approach light system by its code (MALSR), or any of them
    /// ("ALS", or its RAIL alone).
    Approach(Option<&'a str>),
    /// The runway's edge lights (HIRL, MIRL, LIRL, "EDGE LGT").
    Edge,
    Touchdown,
    /// The rotating beacon (BCN, ABN).
    Beacon,
}

/// The approach light systems' codes (AIM 2-1-1, the legend's).
const APPROACH_LIGHTS: &str = "MALS MALSF MALSR SSALS SSALF SSALR SALS ALSF1 ALSF2 ODALS";

/// The light `words` name, the first.
pub fn lamp_of(words: &[String]) -> Option<Lamp<'_>> {
    words.iter().find_map(|w| match w.replace('-', "").as_str() {
        "PAPI" => Some(Lamp::Papi),
        "VASI" | "VASIS" => Some(Lamp::Vasi),
        "REIL" => Some(Lamp::Reil),
        "ALS" | "RAIL" => Some(Lamp::Approach(None)),
        c if APPROACH_LIGHTS.split(' ').any(|a| a == c) => Some(Lamp::Approach(Some(w.as_str()))),
        "HIRL" | "MIRL" | "LIRL" | "EDGE" => Some(Lamp::Edge),
        "TDZL" | "TDZ" => Some(Lamp::Touchdown),
        "BCN" | "ABN" => Some(Lamp::Beacon),
        _ => None,
    })
}

/// Whether a card's light (its legend code and name) is of `lamp`.
pub fn lamp_is(lamp: Lamp, code: Option<&str>, name: &str) -> bool {
    let code = code.map(|c| c.to_ascii_uppercase().replace('-', "")).unwrap_or_default();
    match lamp {
        Lamp::Papi => code.starts_with("PAPI"),
        Lamp::Vasi => code.contains("VASI"),
        Lamp::Reil => code == "REIL",
        Lamp::Approach(Some(c)) => code == c.replace('-', ""),
        Lamp::Approach(None) => APPROACH_LIGHTS.split(' ').any(|a| a == code),
        Lamp::Edge => matches!(code.as_str(), "HIRL" | "MIRL" | "LIRL"),
        Lamp::Touchdown => code == "TDZL",
        Lamp::Beacon => name.to_ascii_lowercase().contains("beacon"),
    }
}

/// A frequency in MHz as written ("118.3", "124.85"), in the VHF band
/// aviation uses, 108 to 137 MHz (navaids from 108, voice from 118): a
/// regulation's "91.137" is none.
pub fn mhz_of(word: &str) -> Option<f64> {
    if !word.contains('.') || !word.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        return None;
    }
    word.parse::<f64>().ok().filter(|f| (108.0..137.0).contains(f))
}

/// The facilities a NOTAM names by their contractions (JO 7340.2) and the
/// frequency types a card lists them by (OurAirports' TWR, GND, ATIS,
/// CTAF, UNIC, AWOS, ASOS).
pub fn facility(word: &str) -> Option<&'static [&'static str]> {
    match word {
        "TWR" | "ATCT" => Some(&["TWR"]),
        "GND" => Some(&["GND"]),
        "ATIS" => Some(&["ATIS"]),
        "CTAF" => Some(&["CTAF"]),
        "UNICOM" | "UNIC" => Some(&["UNIC", "UNICOM"]),
        "AWOS" => Some(&["AWOS"]),
        "ASOS" => Some(&["ASOS"]),
        _ => None,
    }
}

/// Whether a card's frequency type ("AWOS-3", "TWR") is one of `types`.
pub fn facility_is(types: &[&str], kind: &str) -> bool {
    let kind = kind.to_ascii_uppercase();
    types.iter().any(|t| kind == *t || kind.strip_prefix(t).is_some_and(|rest| rest.starts_with('-')))
}

/// Whether `words` name fuel: FUEL, or a grade (100LL, JET A, MOGAS, the
/// unleaded UL94 and UL91).
pub fn is_fuel(words: &[String]) -> bool {
    words.iter().any(|w| matches!(w.as_str(), "FUEL" | "100LL" | "JET" | "JETA" | "JET-A" | "MOGAS" | "UL94" | "94UL" | "UL91" | "91UL"))
}

/// A procedure's title as words to compare ("RNAV (GPS) RWY 09" as RNAV,
/// GPS, RWY, 9): upper case, brackets off, a runway without its leading
/// zero.
pub fn title_words(title: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut after_rwy = false;
    for w in title.split_whitespace() {
        let w = w.trim_matches(|c: char| matches!(c, '(' | ')' | ',' | '.')).to_ascii_uppercase();
        if w.is_empty() {
            continue;
        }
        let said = if after_rwy { ends_of(&w).map_or(w.clone(), |e| e.join("/")) } else { w.clone() };
        after_rwy = w == "RWY";
        out.push(said);
    }
    out
}

/// Whether a card's chart is the procedure a NOTAM titles: the same words,
/// or the same followed by the chart's own category in brackets ("ILS RWY
/// 09 (CAT II - III)", "(SA CAT I)").
pub fn same_procedure(chart: &str, notam: &[String]) -> bool {
    let own = title_words(chart);
    !notam.is_empty() && own.starts_with(notam) && own.get(notam.len()).is_none_or(|w| w == "CAT" || w == "SA")
}

/// A chart's runway ends ("ILS OR LOC RWY 09" is 9) and its navaid words,
/// split at "/" too ("LOC/DME").
pub fn chart_parts(chart: &str) -> (Vec<String>, Vec<String>) {
    let words: Vec<String> =
        chart.split(|c: char| c.is_whitespace() || c == '/').map(|w| w.trim_matches(['(', ')']).to_ascii_uppercase()).collect();
    let rwy = words.iter().position(|w| w == "RWY").and_then(|i| words.get(i + 1)).and_then(|d| ends_of(d)).unwrap_or_default();
    (rwy, words)
}
