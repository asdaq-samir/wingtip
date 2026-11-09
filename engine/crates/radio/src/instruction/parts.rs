//! The instruction's harder parts (instruction.rs's `read`): a hold, an
//! approach, a runway and the altimeter setting, each read where its
//! word was said.

use super::{num, word, Item};
use crate::clearance::{letter, place_words, Token};

/// The kinds of approach a controller clears or says to expect (AIM 5-4,
/// Arrival Procedures), as a recognizer writes them.
pub(super) fn approach_kind(w: &str) -> Option<&'static str> {
    Some(match w {
        "ils" => "ILS",
        "localizer" | "loc" => "LOC",
        "rnav" => "RNAV",
        "gps" => "GPS",
        "rnp" => "RNP",
        "vor" => "VOR",
        "ndb" => "NDB",
        "visual" => "Visual",
        "lda" => "LDA",
        "sdf" => "SDF",
        // Not "contact": "contact approach on one two five ..." is a
        // facility far more often than a contact approach.
        _ => return None,
    })
}

/// The eight points of the compass a hold is said from (AIM 5-3-8:
/// "Direction of holding from the fix in terms of the eight cardinal
/// compass points").
pub(super) const DIRECTIONS: &[&str] = &["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/// Words that end a hold's fix.
pub(super) const AFTER_FIX: &[&str] = &[
    "on", "as", "left", "right", "expect", "maintain", "minute", "minutes", "mile", "miles", "legs", "then", "and", "climb", "descend",
    "contact", "squawk",
];

/// A runway's number and side at `k` ("two seven left" is "27L"), the
/// tokens it took. "The runway number is the whole number nearest
/// one-tenth the magnetic azimuth of the centerline", L, R or C for
/// parallels (AIM 2-3-3): 1 to 36.
pub(super) fn runway_at(toks: &[Token], k: usize) -> Option<(String, usize)> {
    let n = num(toks, k)?;
    let number = n.parse::<i64>().ok().filter(|r| (1..=36).contains(r) && !n.contains('.'))?;
    let side = match word(toks, k + 1) {
        Some("left") => Some('L'),
        Some("right") => Some('R'),
        Some("center") | Some("centre") => Some('C'),
        _ => None,
    };
    // As said: "zero niner" stays "09", "niner" "9".
    let mut runway = if n.len() == 2 { n.to_owned() } else { number.to_string() };
    if let Some(s) = side {
        runway.push(s);
    }
    Some((runway, if side.is_some() { 2 } else { 1 }))
}

/// The altimeter setting in the four figures said ("two niner niner two",
/// AIM 4-2-8's figures one by one) or as written ("29.92"): inches of
/// mercury with two places. Only a setting of 2x.xx or 3x.xx inches is
/// one; anything else was misheard.
pub(super) fn altimeter_of(n: &str) -> Option<String> {
    if let Some((whole, part)) = n.split_once('.') {
        let ok = whole.len() == 2 && part.len() == 2 && matches!(whole.as_bytes()[0], b'2' | b'3');
        return ok.then(|| n.to_owned());
    }
    let ok = n.len() == 4 && matches!(n.as_bytes()[0], b'2' | b'3') && n.bytes().all(|b| b.is_ascii_digit());
    ok.then(|| format!("{}.{}", &n[..2], &n[2..]))
}

/// A hold at `i` ("hold"), and how many tokens it took, in the items AIM
/// 5-3-8 lists for a hold not charted: the direction from the fix, the
/// fix, the "radial, course, bearing, airway or route", the turns "if
/// left turns are to be made", and the "time to expect further
/// clearance"; or "as published", the charted pattern.
pub(super) fn hold_at(toks: &[Token], i: usize) -> Option<(Item, usize)> {
    let mut k = i + 1;
    let mut direction = None;
    if let Some(d) = word(toks, k).filter(|w| DIRECTIONS.contains(w)) {
        direction = Some(d.to_owned());
        k += 1;
    }
    if matches!(word(toks, k), Some("of") | Some("at") | Some("over")) {
        k += 1;
    }
    let from = k;
    while k < toks.len() && !AFTER_FIX.contains(&toks[k].word.as_str()) && k - from < 6 {
        k += 1;
    }
    let fix: Vec<Token> = toks[from..k].iter().filter(|t| t.word != "the").cloned().collect();
    let fix = place_words(&fix);
    if fix.is_empty() {
        return None;
    }
    let mut on = None;
    let mut turns = None;
    let mut published = false;
    let mut efc = None;
    let end = (k + 14).min(toks.len());
    let mut j = k;
    while j < end {
        match toks[j].word.as_str() {
            "radial" | "course" | "bearing" | "track" => {
                let what = match toks[j].word.as_str() {
                    "radial" => "radial",
                    "course" => "course",
                    "bearing" => "bearing",
                    _ => "track",
                };
                // "on the three six zero radial": the figure before it.
                if let Some(d) = (j.saturating_sub(2)..j).rev().find_map(|m| toks[m].num.as_deref().and_then(degrees_or_zero)) {
                    on = Some((what, d));
                }
            }
            "left" if word(toks, j + 1) == Some("turns") => turns = Some("left"),
            "right" if word(toks, j + 1) == Some("turns") => turns = Some("right"),
            "published" => published = true,
            "further" if word(toks, j + 1) == Some("clearance") => {
                // The time, four figures in UTC (AIM 4-2-12: "FAA uses
                // Coordinated Universal Time (UTC) for all operations"),
                // after "at" or straight on.
                efc = (j + 2..(j + 5).min(toks.len()))
                    .find_map(|m| toks[m].num.as_deref().filter(|n| n.len() == 4 && !n.contains('.')).map(str::to_owned));
            }
            _ => {}
        }
        j += 1;
    }
    let used = if efc.is_some() || on.is_some() || turns.is_some() || published { end - i } else { k - i };
    Some((Item::Hold { fix, direction, on, turns, published, efc }, used))
}

/// A radial or course of 0 to 360 ("the three six zero radial", "the
/// zero niner zero course"); a radial may be 0 where a course is not.
pub(super) fn degrees_or_zero(n: &str) -> Option<i64> {
    if n.contains('.') {
        return None;
    }
    n.parse::<i64>().ok().filter(|d| (0..=360).contains(d))
}

/// Where an approach's words begin: "cleared" (with "for the") or
/// "expect" before its kind.
pub(super) fn approach_start(toks: &[Token], i: usize) -> usize {
    (i.saturating_sub(3)..i).find(|&k| toks[k].word == "cleared" || toks[k].word == "expect").unwrap_or(i)
}

/// An approach at `i` (its kind's word): its name, its runway, whether
/// it was cleared or only to be expected, how many tokens it took, and
/// where its runway's figure was. Only where "approach" or "runway"
/// follows, so "contact Chicago Approach" and a VOR said as a place are
/// none.
pub(super) fn approach_at(toks: &[Token], i: usize, kind: &'static str) -> Option<(Item, usize, Option<usize>)> {
    let mut name = kind.to_owned();
    let mut k = i + 1;
    // "RNAV GPS" is the chart's "RNAV (GPS)".
    if kind == "RNAV" && word(toks, k) == Some("gps") {
        name = "RNAV (GPS)".to_owned();
        k += 1;
    }
    // A letter after it: "RNAV (GPS) Zulu", "ILS Yankee".
    if let Some(l) = word(toks, k).and_then(letter) {
        if matches!(word(toks, k + 1), Some("runway") | Some("approach")) {
            name = format!("{name} {l}");
            k += 1;
        }
    }
    let mut runway = None;
    let mut runway_k = None;
    if word(toks, k) == Some("runway") {
        if let Some((r, used)) = runway_at(toks, k + 1) {
            runway = Some(r);
            runway_k = Some(k + 1);
            k += 1 + used;
        }
    }
    let approach = word(toks, k) == Some("approach");
    if approach {
        k += 1;
        // "Visual approach runway two seven".
        if runway.is_none() && word(toks, k) == Some("runway") {
            if let Some((r, used)) = runway_at(toks, k + 1) {
                runway = Some(r);
                runway_k = Some(k + 1);
                k += 1 + used;
            }
        }
    }
    if runway.is_none() && !approach {
        return None;
    }
    let before: Vec<&str> = toks[i.saturating_sub(3)..i].iter().map(|t| t.word.as_str()).collect();
    let cleared = before.contains(&"cleared") && !before.contains(&"expect");
    Some((Item::Approach { name, runway, cleared }, k - i, runway_k))
}
