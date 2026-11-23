//! The procedures a NOTAM names (FAA Order JO 7930.2 7-1-3) and what a
//! sentence with NA takes away of them, split from card.rs for its size.

use super::body::is_runway;
use super::bare;
use crate::contractions::listed;

/// A SID's, an ODP's or a STAR's number as its name spells it, and the
/// word after it: "ADELL EIGHT DEPARTURE (RNAV)", "BENKY SIX ARRIVAL", the
/// procedure's title as the d-TPP charts it and an FDC NOTAM repeats it
/// (JO 7930.2 7-1-3). Its name, a fix's or a place's, is kept in capitals
/// as charted and its number set as a word ("BLOKR Eight departure"), so
/// a pilot finds it on the chart by its name (the owner, 2026-11-23,
/// FDC 6/3373).
const NUMBER_WORDS: &str = "ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE";
const PROCEDURE_KINDS: &str = "DEPARTURE ARRIVAL DEP ARR";

/// A procedure's name or number by the two words after it, or None.
pub(super) fn procedure_word(core: &str, next: &str, after: &str) -> Option<String> {
    if listed(NUMBER_WORDS, core) && listed(PROCEDURE_KINDS, next) {
        return Some([&core[..1], &core[1..].to_ascii_lowercase()].concat());
    }
    let named = listed(NUMBER_WORDS, next) && listed(PROCEDURE_KINDS, after) && core.bytes().all(|b| b.is_ascii_uppercase());
    named.then(|| core.to_owned())
}

/// A procedure the NOTAM names: "ADELL 8", and whether it is RNAV.
#[derive(Debug, PartialEq)]
pub struct Procedure {
    pub name: String,
    pub rnav: bool,
    pub(super) departure: bool,
}

/// The procedures its titles name, as the d-TPP charts them (7-1-3): a
/// name, its number as a word, DEPARTURE or ARRIVAL, and (RNAV) where it
/// is one: "ADELL EIGHT DEPARTURE (RNAV)" is "ADELL 8", RNAV.
pub(super) fn procedures(words: &[&str]) -> Vec<Procedure> {
    let mut out = Vec::new();
    for (i, w) in words.iter().enumerate() {
        let (Some(number), Some(kind)) = (words.get(i + 1), words.get(i + 2).map(|k| bare(k))) else { continue };
        let figure = NUMBER_WORDS.split(' ').position(|n| n == *number);
        let named = !w.is_empty() && w.bytes().all(|b| b.is_ascii_uppercase());
        if let (Some(figure), true, true) = (figure, named, listed(PROCEDURE_KINDS, kind)) {
            let rnav = words.get(i + 3).is_some_and(|n| n.starts_with("(RNAV)"));
            let departure = matches!(kind, "DEPARTURE" | "DEP");
            out.push(Procedure { name: [w, " ", &(figure + 1).to_string()].concat(), rnav, departure });
        }
    }
    out
}

/// What a sentence with NA in it takes away (NA, JO 7340.2; 7-1-3 names
/// the part that is not authorized): every procedure the NOTAM names
/// ("PROCEDURE NA"), those from one runway ("RWY 18/36 PROCEDURES NA"), or
/// the one whose title it is ("BENKY SIX ARRIVAL NA"). Anything else, a
/// transition, a runway's part, "NA AT NIGHT", "NA WHEN ...", is Unsure,
/// and the card then says nothing of its own.
#[derive(Debug, PartialEq)]
pub(super) enum Taken {
    All,
    Runway(String),
    One(Procedure),
    Unsure,
}

pub(super) fn taken_by(s: &[&str]) -> Option<Taken> {
    let b: Vec<&str> = s.iter().map(|w| bare(w)).collect();
    if !b.contains(&"NA") {
        return None;
    }
    Some(match b[..] {
        ["PROCEDURE" | "PROCEDURES", "NA"] => Taken::All,
        ["RWY", d, "PROCEDURE" | "PROCEDURES", "NA"] if is_runway(d) => Taken::Runway(d.to_owned()),
        _ => {
            let title = &s[..s.len() - 1];
            let mut one = procedures(title);
            let whole = b.last() == Some(&"NA") && one.len() == 1 && title.len() == 3 + usize::from(one[0].rnav);
            if whole {
                Taken::One(one.remove(0))
            } else {
                Taken::Unsure
            }
        }
    })
}

/// What the procedures are, in a sentence: "RNAV departures".
pub(super) fn kind_of(p: &[Procedure]) -> String {
    let rnav = if p.iter().all(|p| p.rnav) { "RNAV " } else { "" };
    let kind = if p.iter().all(|p| p.departure) {
        "departures"
    } else if p.iter().all(|p| !p.departure) {
        "arrivals"
    } else {
        "procedures"
    };
    [rnav, kind].concat()
}
