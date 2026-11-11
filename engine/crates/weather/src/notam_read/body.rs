//! A NOTAM's words, as sent, written out word by word in sentence case
//! (notam_read). What each kind of word is, and where it is said:
//!
//! - a contraction, from the one table (crate::contractions: JO 7340.2,
//!   and JO 7930.2 TBL 3-3-1's phrases);
//! - a runway after RWY and the taxiways after TWY, kept as designated
//!   (JO 7930.2 3-3-5, 3-3-6: "RWY 03/21", "TWY B3, C");
//! - a figure and its unit, which JO 7930.2 3-3-3 writes with no space
//!   ("500FT", "5NM", "12500LB", "330DEG"), with a space and the app's
//!   thousands ("1,049 ft");
//! - an altitude: JO 7930.2 4-2-1 says "Feet means mean sea level (MSL)
//!   unless otherwise stated" and AGL is written after a height above the
//!   ground. So a height with its AGL beside it in brackets (an
//!   obstacle's "1049FT (330FT AGL)", 5-2-2) and an obstacle's first
//!   height are said MSL, and a span's levels ("SFC-3000FT") too, unless
//!   AGL follows. A bare "FT" elsewhere is a length (a runway's "E 500FT")
//!   and is left a length;
//! - a compass point (3-3-9's 16) after a distance is "3 nm west of OSH";
//! - a latitude and longitude (3-3-3: "402646N0795856W") in degrees,
//!   minutes and seconds, and a fix, radial and distance ("MSO076008.6")
//!   as "8.6 nm from MSO on the 076° radial";
//! - a schedule's times, UTC unless stated (3-3-2: "DLY 1200-2000"), with
//!   their Z, and its days and SR-SS ("sunrise to sunset").
//!
//! Anything else is kept: a code, an ident or designator (three letters or
//! fewer, or one the caller names), a word with a figure in it (91.137,
//! 122.8), a fix's name before its kind ("CHERN LOM"); a longer word in
//! capitals is set in lower case, as faa_words sets the FAA's capitals,
//! and never changed into another word. Text with any lower case in it is
//! someone's own writing and is left as written.

use crate::contractions::{compass, is_code, listed, lookup, written};

/// The short words of plain English a NOTAM uses, set in lower case (any
/// other word of three letters or fewer is an ident or a designator).
const PLAIN_SHORT: &str = "AND TO OF FOR THE ALL NOT NOW BY IN ON AT IS ARE MAY BE NEW USE OFF OUT SEE PER VIA ONE TWO WET DRY ICE MUD OR AN AS NO BOX BAR END HAS WAS ITS ANY";

/// What a fix's or navaid's name stands before: "CHERN LOM", "PERLS INT".
const FIX_KINDS: &str = "LOM NDB VOR VORTAC INT DME TACAN LOC VOT";

const DAYS: &str = "MON:Mon\nTUE:Tue\nWED:Wed\nTHU:Thu\nFRI:Fri\nSAT:Sat\nSUN:Sun";

/// A word as sent: the brackets before it, the word, the brackets and
/// stops after it.
struct Word<'a> {
    pre: &'a str,
    core: &'a str,
    post: &'a str,
}

fn split(word: &str) -> Word<'_> {
    let start = word.len() - word.trim_start_matches(['(', '[']).len();
    let rest = &word[start..];
    let core = rest.trim_end_matches([')', ']', ',', '.', ';', ':']);
    Word { pre: &word[..start], core, post: &rest[core.len()..] }
}

/// "1049" as "1,049" (as the app writes a figure, crate::ready's); a
/// decimal or a fraction as written, ".5" as "0.5".
pub(super) fn grouped(n: &str) -> String {
    if n.starts_with('.') {
        return ["0", n].concat();
    }
    match n.parse::<i64>() {
        Ok(whole) if n.bytes().all(|b| b.is_ascii_digit()) => crate::ready::grouped(whole),
        _ => n.to_owned(),
    }
}

/// A figure and its unit as JO 7930.2 3-3-3 writes them, split: "500FT"
/// to ("500", "FT"). None where it is not one.
fn figure(core: &str) -> Option<(&str, &'static str)> {
    const UNITS: &str = "FT:ft\nNM:nm\nSM:SM\nLB:lb\nIN:in\nMIN:min\nHR:hr\nKT:kt\nDEG:°";
    for (unit, said) in UNITS.lines().filter_map(|line| line.split_once(':')) {
        if let Some(n) = core.strip_suffix(unit)
            && !n.is_empty()
            && n.bytes().all(|b| b.is_ascii_digit() || b == b'.' || b == b'/')
            && n.bytes().any(|b| b.is_ascii_digit())
        {
            return Some((n, said));
        }
    }
    None
}

fn is_feet(core: &str) -> bool {
    figure(core).is_some_and(|(_, u)| u == "ft")
}

/// A level of a span: SFC or GND, FL180, 3000FT, UNL.
fn level(text: &str, msl: bool) -> Option<String> {
    match text {
        "SFC" | "GND" => Some("surface".into()),
        "UNL" => Some("unlimited".into()),
        _ if text.starts_with("FL") && text.len() > 2 && text[2..].bytes().all(|b| b.is_ascii_digit()) => Some(text.to_owned()),
        _ => figure(text).filter(|(_, u)| *u == "ft").map(|(n, _)| [grouped(n).as_str(), " ft", if msl { " MSL" } else { "" }].concat()),
    }
}

/// "SFC-3000FT" as "surface to 3,000 ft MSL"; AGL after it is said by
/// its own word.
fn span(core: &str, agl_after: bool) -> Option<String> {
    let (a, b) = core.split_once(['-', '−'])?;
    let (low, high) = (level(a, false)?, level(b, !agl_after)?);
    Some([low.as_str(), " to ", &high].concat())
}

/// "0400" as a time of day.
fn hhmm(t: &str) -> bool {
    t.len() == 4
        && t.bytes().all(|b| b.is_ascii_digit())
        && t[..2].parse::<u32>().is_ok_and(|h| h <= 24)
        && t[2..].parse::<u32>().is_ok_and(|m| m < 60)
}

/// A schedule's span of the day: "1200-2000", "SR-SS", "SR-1800".
fn day_span(core: &str) -> Option<String> {
    let (a, b) = core.split_once('-')?;
    let part = |t: &str| match t {
        "SR" => Some("sunrise".to_owned()),
        "SS" => Some("sunset".to_owned()),
        _ if hhmm(t) => Some([t, "Z"].concat()),
        _ => None,
    };
    let (a, b) = (part(a)?, part(b)?);
    let between = if a.ends_with('Z') && b.ends_with('Z') { "–" } else { " to " };
    Some([a.as_str(), between, &b].concat())
}

/// "MON-FRI" as "Mon–Fri", "WED" as "Wed".
fn days(core: &str) -> Option<String> {
    let day = |t: &str| lookup(DAYS, t);
    match core.split_once('-') {
        Some((a, b)) => Some([day(a)?, "–", day(b)?].concat()),
        None => day(core).map(str::to_owned),
    }
}

/// "402646N0795856W", "4401N08834W", "420651.07N0875406.27W" in
/// degrees, minutes and seconds.
fn lat_lon(core: &str) -> Option<String> {
    let ns = core.find(['N', 'S'])?;
    let (lat, rest) = core.split_at(ns);
    let (hemi, lon) = rest.split_at(1);
    let (lon, ew) = lon.split_at(lon.len().checked_sub(1)?);
    if !matches!(ew, "E" | "W") {
        return None;
    }
    let part = |t: &str, deg: usize| -> Option<String> {
        let whole = t.split('.').next()?;
        if !t.bytes().all(|b| b.is_ascii_digit() || b == b'.') || !(whole.len() == deg + 2 || whole.len() == deg + 4) {
            return None;
        }
        let (d, m) = (t[..deg].trim_start_matches('0'), &t[deg..deg + 2]);
        let d = if d.is_empty() { "0" } else { d };
        Some(if whole.len() == deg + 4 { [d, "°", m, "′", &t[deg + 2..], "″"].concat() } else { [d, "°", m, "′"].concat() })
    };
    Some([part(lat, 2)?.as_str(), hemi, " ", &part(lon, 3)?, ew].concat())
}

/// "MSO076008.6", a fix, its radial and distance (FAA's FRD form), as
/// "8.6 nm from MSO on the 076° radial".
fn fix_radial_distance(core: &str) -> Option<String> {
    let b = core.as_bytes();
    if b.len() < 9 || !b[..3].iter().all(u8::is_ascii_uppercase) || !b[3..9].iter().all(u8::is_ascii_digit) {
        return None;
    }
    let rest = &core[9..];
    if !(rest.is_empty() || (rest.starts_with('.') && rest.len() > 1 && rest[1..].bytes().all(|c| c.is_ascii_digit()))) {
        return None;
    }
    let whole = core[6..9].trim_start_matches('0');
    let whole = if whole.is_empty() { "0" } else { whole };
    Some([whole, rest, " nm from ", &core[..3], " on the ", &core[3..6], "° radial"].concat())
}

/// A runway as designated: "18/36", "01L/19R", "09L", or by the compass
/// as a pair where it has no number ("NE/SW", 3-3-5): a lone "E" after a
/// runway is its east part ("RWY 10/28 E 3800FT").
fn is_runway(core: &str) -> bool {
    let pair = core.contains('/');
    core.split('/').all(|end| {
        let digits = end.trim_end_matches(['L', 'R', 'C']);
        (!digits.is_empty() && digits.len() <= 2 && digits.bytes().all(|b| b.is_ascii_digit()) && end.len() - digits.len() <= 1)
            || (pair && compass(end).is_some())
    })
}

/// A taxiway's designator: "A", "B3", "EL", "A1-A6".
pub(super) fn is_taxiway(core: &str) -> bool {
    core.split('-').all(|t| {
        let letters = t.trim_end_matches(|c: char| c.is_ascii_digit());
        !t.is_empty() && t.len() <= 4 && (1..=2).contains(&letters.len()) && letters.bytes().all(|b| b.is_ascii_uppercase())
    }) && written(core).is_none()
        && !listed(PLAIN_SHORT, core)
}

/// What the words around one are, for how it is written.
#[derive(Clone, Copy)]
pub(super) struct Context<'a> {
    /// The idents the caller knows (the field's), kept as written.
    pub idents: &'a [String],
    /// The NOTAM's location ("OSH"), kept as written, and its ICAO form
    /// ("KOSH") too.
    pub location: Option<&'a str>,
    /// An obstacle's (OBST): its first height is MSL.
    pub obstacle: bool,
}

/// The words of a NOTAM, as sent, written out in sentence case.
pub(super) fn rewrite(words: &[&str], cx: &Context) -> String {
    let mut out: Vec<String> = Vec::with_capacity(words.len());
    // After RWY or TWY: the designators that follow are kept, a list of
    // them going on while each has its comma ("TWY B3, C").
    let mut designator: Option<fn(&str) -> bool> = None;
    let mut after_distance = false;
    let mut obstacle_height = cx.obstacle;
    for (i, raw) in words.iter().enumerate() {
        let w = split(raw);
        let next = words.get(i + 1).map(|n| split(n));
        let next_core = next.as_ref().map_or("", |n| n.core);
        let next_is_compass = compass(next_core).is_some();
        let core = w.core;
        let mut distance = false;
        let is_designator = designator.is_some_and(|test| test(core));
        let said: String = if is_designator {
            core.to_owned()
        } else if let Some(s) = span(core, next_core == "AGL") {
            s
        } else if let Some((n, unit)) = figure(core) {
            distance = matches!(unit, "nm" | "ft") && next_is_compass;
            let bracketed_agl = next.as_ref().is_some_and(|n| n.pre.starts_with('(') && is_feet(n.core))
                && words.get(i + 2).is_some_and(|a| split(a).core == "AGL");
            let first_obstacle = obstacle_height && w.pre.is_empty() && !distance && unit == "ft" && !matches!(next_core, "AGL" | "MSL");
            let msl = unit == "ft" && !distance && (bracketed_agl || first_obstacle);
            if unit == "ft" && !distance {
                obstacle_height = false;
            }
            match unit {
                "°" => [grouped(n).as_str(), "°"].concat(),
                _ => [grouped(n).as_str(), " ", unit, if msl { " MSL" } else { "" }].concat(),
            }
        } else if let Some(unit) = match core {
            "NM" => Some("nm"),
            "FT" => Some("ft"),
            _ => None,
        } {
            // A unit sent apart from its figure, as an FDC NOTAM's "1.2 NM SE".
            distance = next_is_compass;
            unit.to_owned()
        } else if let Some(s) = day_span(core).or_else(|| days(core)).or_else(|| lat_lon(core)).or_else(|| fix_radial_distance(core)) {
            s
        } else if let Some(dir) = compass(core) {
            [dir, if after_distance && next_core != "OF" { " of" } else { "" }].concat()
        } else if core == "AGL" {
            "above ground".to_owned()
        } else if let Some(full) = written(core) {
            full.to_owned()
        } else {
            keep_or_lower(core, next_core, cx)
        };
        designator = match core {
            "RWY" | "RWYS" => Some(is_runway),
            "TWY" | "TWYS" => Some(is_taxiway),
            _ if is_designator && w.post.contains(',') => designator,
            _ => None,
        };
        after_distance = distance;
        out.push([w.pre, &said, w.post].concat());
    }
    sentences(&out)
}

/// A word that is no contraction: a code, an ident, a figure or a fix's
/// name kept; a longer word in capitals in lower case.
fn keep_or_lower(core: &str, next: &str, cx: &Context) -> String {
    let letters = core.bytes().filter(u8::is_ascii_alphabetic).count();
    let kept = is_code(core)
        || core.bytes().any(|b| b.is_ascii_digit())
        || cx.idents.iter().any(|i| i == core)
        || cx.location.is_some_and(|l| core == l || core.strip_prefix('K') == Some(l))
        || (letters <= 3 && !listed(PLAIN_SHORT, core))
        || listed(FIX_KINDS, next)
        || listed(FIX_KINDS, core);
    if kept {
        core.to_owned()
    } else {
        core.to_ascii_lowercase()
    }
}

/// The words joined, each sentence's first letter a capital.
fn sentences(words: &[String]) -> String {
    let mut out = String::new();
    let mut capital = true;
    for w in words {
        if !out.is_empty() {
            out.push(' ');
        }
        let mut done = false;
        for c in w.chars() {
            if capital && !done && c.is_ascii_alphabetic() {
                out.push(c.to_ascii_uppercase());
                done = true;
            } else {
                out.push(c);
            }
        }
        if done || w.bytes().any(|b| b.is_ascii_alphanumeric()) {
            capital = false;
        }
        if w.ends_with('.') && !w.ends_with("..") {
            capital = true;
        }
    }
    out
}

/// A place's name as the FAA writes it in capitals before a procedure's
/// ("CHICAGO O'HARE INTL, CHICAGO, IL."), each word capitalised, a state's
/// two letters kept: "Chicago O'Hare International, Chicago, IL.".
pub(super) fn title(words: &[&str]) -> String {
    let mut out = String::new();
    for w in words {
        let s = split(w);
        // The airport file's own short words for a field's kind.
        let core = lookup("INTL:INTERNATIONAL\nRGNL:REGIONAL\nMUNI:MUNICIPAL", s.core).unwrap_or(s.core);
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(s.pre);
        let keep = core.len() <= 2 || core.bytes().any(|b| b.is_ascii_digit());
        let mut start = true;
        for c in core.chars() {
            out.push(if start || keep { c } else { c.to_ascii_lowercase() });
            start = matches!(c, '\'' | '/' | '-');
        }
        out.push_str(s.post);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn its_parts_are_written_as_the_order_writes_them() {
        assert_eq!(grouped("1049"), "1,049");
        assert_eq!(grouped(".5"), "0.5");
        assert_eq!(span("SFC-3000FT", false).as_deref(), Some("surface to 3,000 ft MSL"));
        assert_eq!(span("SFC-400FT", true).as_deref(), Some("surface to 400 ft"));
        assert_eq!(lat_lon("345140N0804506W").as_deref(), Some("34°51′40″N 80°45′06″W"));
        assert_eq!(lat_lon("4401N08834W").as_deref(), Some("44°01′N 88°34′W"));
        assert_eq!(fix_radial_distance("MSO076008.6").as_deref(), Some("8.6 nm from MSO on the 076° radial"));
        assert_eq!(day_span("SR-SS").as_deref(), Some("sunrise to sunset"));
        assert_eq!(day_span("1200-2000").as_deref(), Some("1200Z–2000Z"));
        assert_eq!(days("MON-FRI").as_deref(), Some("Mon–Fri"));
        assert!(is_runway("01L/19R") && is_runway("NE/SW") && !is_runway("E") && !is_runway("CLSD"));
        assert!(is_taxiway("B3") && !is_taxiway("BTN") && !is_taxiway("ALL"));
    }
}
