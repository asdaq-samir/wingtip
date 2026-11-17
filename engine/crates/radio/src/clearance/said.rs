use super::*;

// --- calls to us (lib/heardCall): callsign.rs ------------------------

pub use crate::callsign::our_call;
use crate::callsign::{CALL_WITHIN, TYPE_WORDS};

pub(super) const AFTER_DIRECT: &[&str] = &[
    "then", "climb", "maintain", "descend", "contact", "squawk", "expect", "cross", "at", "and", "when", "resume", "report", "cleared",
    "fly", "heading", "intercept", "join", "hold", "for", "via", "own", "navigation", "after",
];

/// Each letter and figure, and the words a recognizer writes for it (AIM
/// 4-2-7, TBL 4-2-7; "tree", "fife", "niner"), for the call sign's
/// pattern below: the inverse of `letter` and `digit`.
pub(super) const SAID: &[(char, &[&str])] = &[
    ('A', &["alpha", "alfa"]),
    ('B', &["bravo"]),
    ('C', &["charlie"]),
    ('D', &["delta"]),
    ('E', &["echo"]),
    ('F', &["foxtrot"]),
    ('G', &["golf"]),
    ('H', &["hotel"]),
    ('I', &["india"]),
    ('J', &["juliet", "juliett"]),
    ('K', &["kilo"]),
    ('L', &["lima"]),
    ('M', &["mike"]),
    ('N', &["november"]),
    ('O', &["oscar"]),
    ('P', &["papa"]),
    ('Q', &["quebec"]),
    ('R', &["romeo"]),
    ('S', &["sierra"]),
    ('T', &["tango"]),
    ('U', &["uniform"]),
    ('V', &["victor"]),
    ('W', &["whiskey", "whisky"]),
    ('X', &["xray"]),
    ('Y', &["yankee"]),
    ('Z', &["zulu"]),
    ('0', &["zero"]),
    ('1', &["one"]),
    ('2', &["two"]),
    ('3', &["three", "tree"]),
    ('4', &["four", "fower"]),
    ('5', &["five", "fife"]),
    ('6', &["six"]),
    ('7', &["seven"]),
    ('8', &["eight", "ait"]),
    ('9', &["nine", "niner"]),
];

/// Our call sign as a regular expression over a recognizer's words, for
/// the iOS app to tell a call to us while the phone is locked
/// (SpeechPlugin.swift), as `our_call` hears one: the registration with
/// its N, or a type's name in its place, or the prefix and its last
/// three, within the first words (CALL_WITHIN). None where `tail` is no
/// registration. The web's lib/heardCall callPattern, to the character.
pub fn call_pattern(tail: &str) -> Option<String> {
    let full = tail.trim().to_uppercase();
    if !(2..=7).contains(&full.len()) || !full.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    let say_chars = |chars: &str| -> String {
        chars
            .chars()
            .map(|ch| {
                let mut ways = vec![ch.to_ascii_lowercase().to_string()];
                if let Some((_, words)) = SAID.iter().find(|(c, _)| *c == ch) {
                    ways.extend(words.iter().map(|w| (*w).to_owned()));
                }
                format!("(?:{})", ways.join("|"))
            })
            .collect::<Vec<_>>()
            .join("[\\s,-]*")
    };
    let body = full.strip_prefix('N').unwrap_or(&full);
    let last = say_chars(&body[body.len().saturating_sub(3)..]);
    let n = say_chars("N");
    let types = TYPE_WORDS.join("|");
    Some(format!(
        "^\\W*(?:[a-z']+\\W+){{0,{CALL_WITHIN}}}?(?:(?:{n}[\\s,-]*)?{}|{n}[\\s,-]*{last}|(?:{types})\\W+{last})\\b",
        say_chars(body)
    ))
}

/// The place a "direct" sends us to, as words to find, or None.
pub fn direct_of(text: &str) -> Option<String> {
    let toks = tokens(text);
    let at = toks.iter().position(|t| t.word == "direct")?;
    let mut place: Vec<Token> = Vec::new();
    for t in &toks[at + 1..] {
        if place.len() >= 6 {
            break;
        }
        if t.word == "to" || t.word == "the" {
            if place.is_empty() {
                continue;
            }
            break;
        }
        if AFTER_DIRECT.contains(&t.word.as_str()) || (t.num.is_some() && !place.iter().any(|p| letter(&p.word).is_some())) {
            break;
        }
        place.push(t.clone());
    }
    let said = place_words(&place);
    (!said.is_empty()).then_some(said)
}
