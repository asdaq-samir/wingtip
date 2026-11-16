//! A D-ATIS's remarks as a pilot reads them on the airport card: the
//! sentences after its weather (AIM 4-1-13: the approaches and runways in
//! use, then the NOTAMs and the rest), an item each, in the FAA's words set
//! in sentence case with its codes kept, as faa_words sets the FAA's other
//! capital text (CLAUDE.md's Writing rule).
//!
//! The data link's text is written for the tower's voice as much as for a
//! screen: KORD's writes 9,725 ft as "9 THSD 7 HND 25 FT" and lists a
//! runway's inner marker out of service a sentence a runway. Here the
//! figure is written as a figure, the contractions of FAA Order JO 7340.2
//! (wingtip-weather's contractions, the NOTAM reader's table) are written
//! out, RWY and TWY stay before their idents, and the sentences that say
//! the same of several runways ("RWY 9L IM OTS. RWY 9C IM OTS.") are one
//! item with every runway listed: nothing is dropped but the heading
//! ("NOTICE TO AIRMEN"), the closing "ADVS YOU HAVE INFO K", and a sentence
//! the read's own figures already show whole (the approach and runways in
//! use, read_datis). The spoken words read_datis hears stay its own.

use crate::atis::{read, Atis};
use crate::datis::{said_in_full, weather_at};
use wingtip_core::faa_case::faa_words_keeping;
use wingtip_core::text::grouped;
use wingtip_weather::contractions;

/// The D-ATIS's own codes a pilot reads as written, kept in capitals
/// beside faa_words' own: the movement area's RWY and TWY before their
/// idents, land and hold short (LAHSO, AIM 4-3-11), and the ILS's markers,
/// glide slope and the lights and RVR a NOTAM names (JO 7340.2).
/// And HS, hold short, as the broadcast writes it ("READ BACK HS").
const KEEP: [&str; 16] =
    ["RWY", "RWYS", "TWY", "TWYS", "LAHSO", "HS", "IM", "OM", "MM", "GS", "PAPI", "VASI", "RVR", "ALS", "MALSR", "ALSF"];

/// The remarks, an item each, in the broadcast's order.
pub fn datis_remarks(text: &str) -> Vec<String> {
    let raw: Vec<&str> = text.split_whitespace().collect();
    let bare: Vec<&str> = raw.iter().map(|w| w.trim_matches(|c: char| matches!(c, '.' | ',' | ';' | ':'))).collect();
    // After the altimeter and its figures said again in brackets "(THREE
    // ZERO ZERO SIX)"; a text with no weather groups after its heading.
    let mut start = match weather_at(&bare) {
        Some((_, alt_at)) => alt_at + 1,
        None => raw.iter().position(|w| w.ends_with('.')).map_or(raw.len(), |i| i + 1),
    };
    if raw.get(start).is_some_and(|w| w.starts_with('(')) {
        while start < raw.len() && !raw[start].trim_end_matches(['.', ',']).ends_with(')') {
            start += 1;
        }
        start += 1;
    }
    // The field's own ident, which the heading begins with ("MSP ARR INFO
    // I"), kept where a remark names it ("BIRDS NEAR MSP").
    let mut keep = KEEP.to_vec();
    keep.extend(bare.iter().find(|w| (3..=4).contains(&w.len()) && w.bytes().all(|b| b.is_ascii_uppercase())));
    // What read_datis reads of the words after the weather, its approach
    // and runways: read here as it reads them, without its METAR reader.
    let start = start.min(raw.len());
    let full = read(&raw[start..].iter().map(|w| said_in_full(w)).collect::<Vec<_>>().join(" "));
    let kept: Vec<Vec<&str>> = sentences(&raw[start..]).into_iter().filter(|s| !left_out(s, &full)).collect();
    let folds: Vec<Option<(Vec<String>, String)>> = kept.iter().map(|s| runways_of(s)).collect();
    let mut out = Vec::new();
    for (i, s) in kept.iter().enumerate() {
        let Some((_, rest)) = &folds[i] else {
            out.push(shown(s, &keep));
            continue;
        };
        let alike: Vec<&Vec<String>> = folds.iter().flatten().filter(|(_, r)| r == rest).map(|(rw, _)| rw).collect();
        if alike.len() < 2 {
            out.push(shown(s, &keep));
        } else if folds[..i].iter().flatten().all(|(_, r)| r != rest) {
            let list: Vec<String> = alike.iter().map(|rw| rw.join(if reciprocal(rw) { "/" } else { ", " })).collect();
            let what: Vec<&str> = rest.split(' ').collect();
            out.push(format!("{}: RWY {}", shown(&what, &keep), list.join(", ")));
        }
    }
    out
}

/// The words a sentence at a time, split where the text has a full stop
/// or a semicolon after a word, its closing mark and any leading "..." off.
fn sentences<'a>(words: &[&'a str]) -> Vec<Vec<&'a str>> {
    let mut out = vec![Vec::new()];
    for w in words {
        let word = w.trim_start_matches('.');
        let ends = word.ends_with(['.', ';']);
        let word = word.trim_end_matches(['.', ';']);
        if let (false, Some(s)) = (word.is_empty(), out.last_mut()) {
            s.push(word);
        }
        if ends && out.last().is_some_and(|s| !s.is_empty()) {
            out.push(Vec::new());
        }
    }
    out.retain(|s| !s.is_empty());
    out
}

/// The heading, the closing line, and a sentence whose figures the read
/// shows and that says nothing more.
fn left_out(s: &[&str], full: &Atis) -> bool {
    let joined = s.join(" ");
    if matches!(joined.as_str(), "NOTICE TO AIRMEN" | "NOTICE TO AIR MISSIONS" | "NOTAMS") || matches!(s[0], "ADVS" | "ADVISE") {
        return true;
    }
    let said: Vec<String> = s.iter().map(|w| said_in_full(w)).collect();
    let r = read(&said.join(" "));
    let figures = r.approach.is_some() || !r.landing.is_empty() || !r.departing.is_empty();
    let shown = r.approach.as_ref().is_none_or(|a| full.approach.as_ref().is_some_and(|f| f.contains(a.as_str())))
        && r.landing.iter().all(|x| full.landing.contains(x))
        && r.departing.iter().all(|x| full.departing.contains(x));
    figures && shown && r.remarks.is_empty()
}

/// A runway's ident: 1 to 36, and its side.
fn runway(w: &str) -> bool {
    let digits = w.trim_end_matches(['L', 'C', 'R']);
    w.len() - digits.len() <= 1 && digits.bytes().all(|b| b.is_ascii_digit()) && digits.parse::<u8>().is_ok_and(|n| (1..=36).contains(&n))
}

/// A sentence that begins with its runways ("RWY 4L 22R CLSD", "RWY 9L IM
/// OTS"): their idents and what it says of them, to fold with the others
/// that say the same.
fn runways_of(s: &[&str]) -> Option<(Vec<String>, String)> {
    if !matches!(s.first(), Some(&"RWY" | &"RWYS")) {
        return None;
    }
    let mut idents = Vec::new();
    let mut i = 1;
    while let Some(w) = s.get(i) {
        let parts: Vec<&str> = w.trim_end_matches(',').split('/').collect();
        if parts.iter().all(|p| runway(p)) {
            idents.extend(parts.iter().map(|p| (*p).to_owned()));
        } else if *w != "AND" {
            break;
        }
        i += 1;
    }
    (!idents.is_empty() && i < s.len()).then(|| (idents, s[i..].join(" ")))
}

/// Two ends of one runway: 18 apart, left against right (AC 150/5340-1,
/// runway designation marking).
fn reciprocal(rw: &[String]) -> bool {
    let end = |w: &str| {
        let d = w.trim_end_matches(['L', 'C', 'R']);
        (d.parse::<i32>().unwrap_or(0), w[d.len()..].to_owned())
    };
    let [a, b] = rw else { return false };
    let ((n, x), (m, y)) = (end(a), end(b));
    let side = matches!((x.as_str(), y.as_str()), ("L", "R") | ("R", "L") | ("C", "C") | ("", ""));
    (n - m).abs() == 18 && side
}

/// A sentence in the FAA's words in sentence case: the voice's thousands
/// and hundreds as one figure ("9 THSD 7 HND 25 FT" is 9,725 ft), a
/// length in feet with its thousands grouped, the contractions written
/// out but RWY and TWY, and the codes kept.
fn shown(s: &[&str], keep: &[&str]) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < s.len() {
        let w = s[i];
        let core = w.trim_end_matches([',', ':']);
        let tail = &w[core.len()..];
        if core.bytes().all(|b| b.is_ascii_digit()) && !core.is_empty() && matches!(s.get(i + 1), Some(&"THSD" | &"HND")) {
            let (mut sum, mut j, mut last) = (0u64, i, w);
            while let (Some(n), Some(unit)) = (s.get(j).and_then(|d| d.parse::<u64>().ok()), s.get(j + 1)) {
                let scale = match *unit {
                    "THSD" => 1000,
                    "HND" => 100,
                    _ => break,
                };
                sum += n * scale;
                last = unit;
                j += 2;
            }
            if let Some(n) = s.get(j).and_then(|d| d.trim_end_matches(',').parse::<u64>().ok()).filter(|n| *n < 100) {
                sum += n;
                last = s[j];
                j += 1;
            }
            out.push(format!("{}{}", grouped(&sum.to_string()), &last[last.trim_end_matches(',').len()..]));
            i = j;
            continue;
        }
        let feet = matches!(s.get(i + 1).map(|n| n.trim_end_matches(',')), Some("FT" | "FEET"));
        out.push(match contractions::written(core).filter(|_| !keep.contains(&core)) {
            Some(words) => format!("{}{tail}", words.to_ascii_uppercase()),
            None if feet && core.len() > 3 => format!("{}{tail}", grouped(core)),
            None => w.to_owned(),
        });
        i += 1;
    }
    faa_words_keeping(&out.join(" "), keep)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn figures_said_for_the_voice_are_written_as_figures() {
        assert_eq!(shown(&["9", "THSD", "7", "HND", "25", "FT", "AVBL"], &KEEP), "9,725 ft available");
        assert_eq!(shown(&["9750", "FT"], &KEEP), "9,750 ft");
        assert_eq!(shown(&["FREQ", "121.67"], &KEEP), "Frequency 121.67");
    }

    #[test]
    fn a_runways_two_ends_are_one_runway() {
        assert!(reciprocal(&["4L".into(), "22R".into()]));
        assert!(reciprocal(&["9C".into(), "27C".into()]));
        assert!(!reciprocal(&["12R".into(), "12L".into()]));
        assert!(!runway("37") && runway("9L") && !runway("V9"));
    }
}
