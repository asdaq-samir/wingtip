//! The FAA's own capitalised text in sentence case with its codes kept
//! (CLAUDE.md's rule; the web's lib/advisories `faaWords`): here in core,
//! below the weather crate as well as the wording crate, so a TFR's
//! purpose is cased by the same one copy as the rest (the aviation
//! audit's AV-18). The wording crate re-exports it.
//!
//! The web wrote it with JavaScript's regular expressions, whose `\b`,
//! `\w` and `[a-z]` are ASCII only and whose `\s` is its own set of
//! spaces; the scans below keep to those, so an accented letter or an odd
//! space is treated as the web treated it.

use crate::notam_text::{compass_point, ident_by_place, slashed_code, whole_notam};

/// JavaScript's `\w` without the u flag: ASCII letters, figures and `_`.
pub fn js_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// JavaScript's `\s`: its WhiteSpace and LineTerminator characters, which
/// differ from Unicode's White_Space by U+FEFF (in) and U+0085 (out).
pub fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// JavaScript's String.prototype.trim.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(js_space)
}

/// What the FAA's own capitalised text keeps in capitals once it is set
/// in sentence case: the codes a pilot reads as written -- the services
/// and the airspace, the references, and the weather contractions of a
/// G-AIRMET's or SIGMET's "due to" (CIG BLW 010 VIS BLW 3SM BR FG) -- and
/// a field's radio as its frequencies are listed.
const CODES: [&str; 72] = [
    "NOTAM", "TFR", "MOA", "ATC", "ATCAA", "ARTCC", "FAA", "FSS", "DOD", "US", "USA", "VFR", "IFR", "MVFR", "LIFR", "AGL", "MSL", "SFC",
    "UTC", "FL", "NM", "SM", "AIRMET", "SIGMET", "PIREP", "METAR", "TAF", "LLWS", "ICG", "TURB", "CIG", "BLW", "VIS", "BR", "FG", "HZ",
    "FU", "DU", "SA", "RA", "SN", "DZ", "TS", "PCPN", "MTN", "MTNS", "OBSC", "OBSCN", "CLDS", "BKN", "OVC", "SCT", "FEW", "N", "S", "E",
    "W", "NE", "NW", "SE", "SW", "APP", "DEP", "TWR", "GND", "CTAF", "UNICOM", "ATIS", "AWOS", "ASOS", "CLNC", "DEL",
];
/// The rest of the radio's codes (the list ran past one array's line).
/// And the codes a TFR's purpose is written with: "VIP MOVEMENT" (a
/// 91.141 flight restriction in the proximity of the President and other
/// parties) and "UAS" (unmanned aircraft systems), so they read "VIP
/// movement" and "UAS", not "Vip" and "uas". And a NOTAM's references to
/// an obstacle's file: the FCC's Antenna Structure Registration (ASR) and
/// the FAA's aeronautical study number (ASN, 14 CFR 77's obstruction
/// evaluation).
const MORE_CODES: [&str; 6] = ["RDO", "ANG", "VIP", "UAS", "ASR", "ASN"];

/// An instrument procedure's codes as its title on the plate writes them
/// (AIM 5-4-5, the approach charts' naming; the d-TPP's chart names): the
/// navigation it is flown by, the approach's levels of service, its
/// category (CAT I, II, III), and the letter that tells two approaches to
/// one runway apart ("RNAV (GPS) Z RWY 36"), so "ILS OR LOC RWY 36" reads
/// "ILS or LOC rwy 36", not "Ils or loc rwy 36". A lone I, X, Y or Z is
/// never a word of the FAA's other capital text, so it is safe here.
const PROCEDURE_CODES: [&str; 26] = [
    "ILS", "LOC", "LDA", "SDF", "BC", "VOR", "VORTAC", "TACAN", "NDB", "DME", "GPS", "RNAV", "RNP", "GLS", "GBAS", "LPV", "LNAV", "VNAV",
    "PRM", "CAT", "I", "II", "III", "X", "Y", "Z",
];

fn is_code(word: &str) -> bool {
    CODES.contains(&word) || MORE_CODES.contains(&word) || PROCEDURE_CODES.contains(&word) || compass_point(word)
}

fn day(word: &str) -> Option<&'static str> {
    Some(match word {
        "MON" => "Mon",
        "TUE" => "Tue",
        "WED" => "Wed",
        "THU" => "Thu",
        "FRI" => "Fri",
        "SAT" => "Sat",
        "SUN" => "Sun",
        _ => return None,
    })
}

/// One word of the FAA's capitals in sentence case: a code or a word with
/// a figure in it as it is, "NOTAMS" as "NOTAMs", a day as a day is
/// written, the rest in lower case.
fn sentence_word(word: &str) -> String {
    if word.bytes().any(|b| b.is_ascii_digit()) || is_code(word) {
        word.to_owned()
    } else if word == "NOTAMS" {
        "NOTAMs".to_owned()
    } else {
        day(word).map_or_else(|| word.to_ascii_lowercase(), str::to_owned)
    }
}

/// The FAA's capitalised text -- a special-use area's times of use, a
/// G-AIRMET's cause, a TFR's purpose -- in sentence case, its codes kept:
/// "INTERMITTENT BY NOTAM 4 HOURS IN ADVANCE" reads "Intermittent by
/// NOTAM 4 hours in advance". A word with a figure in it (20KTS, FL180,
/// 0700) is a code too, its letters before a hyphen and all (R-4401A),
/// and an airspace's class is written as the AIM writes it, "Class B"
/// (AIM 3-2-1). Text with any lower case is someone's own writing and is
/// left as it is, and so are raw reports, which pilots read as sent.
pub fn faa_words(text: &str) -> String {
    if text.bytes().any(|b| b.is_ascii_lowercase()) || whole_notam(text) {
        return text.to_owned();
    }
    let c: Vec<char> = text.chars().collect();
    let upper_or_figure = |ch: char| ch.is_ascii_uppercase() || ch.is_ascii_digit();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < c.len() {
        // "CLASS B" with a word's edge either side.
        let edge_before = i == 0 || !js_word(c[i - 1]);
        if edge_before
            && c.len() >= i + 7
            && c[i..i + 6].iter().copied().eq("CLASS ".chars())
            && ('A'..='G').contains(&c[i + 6])
            && c.get(i + 7).is_none_or(|&n| !js_word(n))
        {
            out.push_str("Class ");
            out.push(c[i + 6]);
            i += 7;
            continue;
        }
        // A designator, letters, a hyphen and a figure: R-4401A.
        if c[i].is_ascii_uppercase() {
            let mut j = i;
            while j < c.len() && c[j].is_ascii_uppercase() {
                j += 1;
            }
            // A circling approach's letter after its navigation (VOR-A,
            // NDB-B, VOR/DME-C: AIM 5-4-5's naming) is part of its name.
            let word: String = c[i..j].iter().collect();
            let letter_after =
                is_code(&word) && c.get(j + 1).is_some_and(char::is_ascii_uppercase) && c.get(j + 2).is_none_or(|&n| !js_word(n));
            if c.get(j) == Some(&'-') && letter_after {
                out.extend(&c[i..j + 2]);
                i = j + 2;
                continue;
            }
            if c.get(j) == Some(&'-') && c.get(j + 1).is_some_and(char::is_ascii_digit) {
                let mut k = j + 2;
                while k < c.len() && upper_or_figure(c[k]) {
                    k += 1;
                }
                out.extend(&c[i..k]);
                i = k;
                continue;
            }
        }
        if edge_before && let Some(len) = slashed_code(&c, i) {
            out.extend(&c[i..i + len]);
            i += len;
            continue;
        }
        if upper_or_figure(c[i]) {
            let mut j = i;
            while j < c.len() && upper_or_figure(c[j]) {
                j += 1;
            }
            let word: String = c[i..j].iter().collect();
            if ident_by_place(&c, i, j) {
                out.push_str(&word);
            } else {
                out.push_str(&sentence_word(&word));
            }
            i = j;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    sentence_starts(&out)
}

/// A sentence's first letter a capital, and the first after a full stop,
/// a question or an exclamation mark and a space.
fn sentence_starts(text: &str) -> String {
    let mut c: Vec<char> = text.chars().collect();
    if c.first().is_some_and(char::is_ascii_lowercase) {
        c[0] = c[0].to_ascii_uppercase();
    }
    let mut i = 0;
    while i < c.len() {
        if matches!(c[i], '.' | '!' | '?') {
            let mut j = i + 1;
            while j < c.len() && js_space(c[j]) {
                j += 1;
            }
            if j > i + 1 && j < c.len() && c[j].is_ascii_lowercase() {
                c[j] = c[j].to_ascii_uppercase();
                i = j;
            }
        }
        i += 1;
    }
    c.into_iter().collect()
}
