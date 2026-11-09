//! Our call sign in a transmission, and where in it: a controller says
//! it first, as an airplane is addressed; a pilot acknowledges "with your
//! aircraft identification, either at the beginning or at the end of your
//! transmission" (AIM 4-2-3 c), and "include[s] the aircraft
//! identification in all readbacks and acknowledgments" (AIM 4-4-7 b.1).
//!
//! The forms AIM 4-2-4 lets a civil call sign take: the registration
//! whole with its N, the type or maker's name in the N's place ("When the
//! aircraft manufacturer's name or model is stated, the prefix "N" is
//! dropped", 4-2-4 b.1), or, once talking, "the prefix and the last three
//! digits/letters" (4-2-4 a.2). A longer call sign that ends the same is
//! someone else's: "Improper use of call signs can result in pilots
//! executing a clearance intended for another aircraft" (4-2-4 a.1), and
//! no pilot may fly another airplane's instruction (14 CFR 91.123(e)).
//!
//! Moved here from clearance.rs, which re-exports `our_call`; the web's
//! lib/heardCall and the phones ask it as `our_call`.

use crate::clearance::{digit, is_ascii_digits, letter, phrases};

/// Words said in place of the N (AIM 4-2-4 b), the common ones; "Tango"
/// for an air taxi.
pub(crate) const TYPE_WORDS: &[&str] = &[
    "cessna", "skyhawk", "skylane", "skylark", "centurion", "cardinal", "caravan", "citation", "piper", "cherokee", "warrior", "archer",
    "arrow", "dakota", "lance", "saratoga", "seneca", "seminole", "aztec", "navajo", "malibu", "cub", "cirrus", "mooney", "bonanza", "baron",
    "beech", "beechcraft", "king", "diamond", "katana", "grumman", "tiger", "cheetah", "yankee", "experimental", "lancair", "glasair", "vans",
    "rv", "sport", "helicopter", "robinson", "tango", "november",
];

/// How far into a transmission our call sign may begin: a controller says
/// it first, after at most the facility's name ("Chicago Approach,
/// Cessna ..."); a pilot's readback ends with it.
pub(crate) const CALL_WITHIN: usize = 3;

/// How near the end a call sign may finish and still be said "at the
/// end" (AIM 4-2-3 c): a "thanks" or "over" after it.
const END_WITHIN: usize = 2;

/// A letter or figure as said ("alpha", "tree", "3ab"), as one mark.
fn mark(w: &str) -> Option<String> {
    if let Some(l) = letter(w) {
        return Some(l.to_string());
    }
    if let Some(d) = digit(w) {
        return Some(d.to_string());
    }
    let alnum = w.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
    (is_ascii_digits(w) || (alnum && w.bytes().any(|b| b.is_ascii_digit()))).then(|| w.to_uppercase())
}

/// The words a recognizer wrote, lower case, "x-ray" one word.
fn words_of(text: &str) -> Vec<String> {
    words_and_breaks(text).0
}

/// The words, and for each whether a phrase ends after it (a comma or
/// semicolon, clearance::phrases): a call sign is said within a phrase,
/// so "Cessna three alpha bravo, three miles from Rozie" is not "3AB3".
fn words_and_breaks(text: &str) -> (Vec<String>, Vec<bool>) {
    let (mut words, mut breaks) = (Vec::new(), Vec::new());
    for phrase in phrases(text) {
        let lower = phrase.to_lowercase().replace("x-ray", "xray").replace("x ray", "xray");
        let these: Vec<String> = lower.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()).map(str::to_owned).collect();
        let n = these.len();
        words.extend(these);
        breaks.extend((0..n).map(|k| k + 1 == n));
    }
    (words, breaks)
}

/// Where our call sign was said: the first word of it (a type's name
/// counted in), the word after it, and how many words the text has.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Said {
    pub start: usize,
    /// The first letter or figure of it, after any type's name.
    pub marks: usize,
    pub end: usize,
    pub words: usize,
}

impl Said {
    /// Said first, as a controller addresses an airplane.
    pub fn first(&self) -> bool {
        self.marks <= CALL_WITHIN
    }

    /// Said last, as a pilot ends an acknowledgment (AIM 4-2-3 c).
    pub fn last(&self) -> bool {
        self.words - self.end <= END_WITHIN
    }
}

/// Each place the airplane `tail` ("N123AB") is named in `text`, in any
/// form AIM 4-2-4 lets its call sign take; none where `tail` is no
/// registration.
pub fn spans(text: &str, tail: &str) -> Vec<Said> {
    let full = tail.trim().to_uppercase();
    if !(2..=7).contains(&full.len()) || !full.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Vec::new();
    }
    let body = full.strip_prefix('N').unwrap_or(&full).to_owned();
    let last = body[body.len().saturating_sub(3)..].to_owned();
    let (words, breaks) = words_and_breaks(text);
    let mut out = Vec::new();
    let mut i = 0;
    while i < words.len() {
        if mark(&words[i]).is_none() {
            i += 1;
            continue;
        }
        let mut run = String::new();
        let mut j = i;
        while let Some(m) = words.get(j).and_then(|w| mark(w)) {
            run.push_str(&m);
            j += 1;
            if breaks[j - 1] {
                break;
            }
        }
        let before = if i > 0 { Some(words[i - 1].as_str()) } else { None };
        let typed = before.is_some_and(|b| TYPE_WORDS.contains(&b));
        if run == full || run == format!("N{body}") || run == body || run == format!("N{last}") || (run == last && typed) {
            // The type's name is part of the call sign where it was said.
            let start = if typed { i - 1 } else { i };
            out.push(Said { start, marks: i, end: j, words: words.len() });
        }
        i = j;
    }
    out
}

/// Whether the transmission is said to the airplane `tail` ("N123AB"):
/// its call sign within the first words, as a controller says it; never
/// a longer call sign that ends the same (AIM 4-2-4 a.1).
pub fn our_call(text: &str, tail: &str) -> bool {
    spans(text, tail).iter().any(Said::first)
}

/// Who said a transmission, as far as its words tell (AIM 4-2-3 c, 4-4-7
/// b.1): our call sign first is ATC calling us, unless what follows is an
/// acknowledgment; our call sign last is our own transmission.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Who {
    ToUs,
    FromUs,
    Other,
}

impl Who {
    pub fn name(self) -> &'static str {
        match self {
            Who::ToUs => "to_us",
            Who::FromUs => "from_us",
            Who::Other => "other",
        }
    }
}

/// Words a pilot says acknowledging or reading back, not a controller
/// instructing (AIM 4-2-3 c: "Wilco", "Roger", "Affirmative"; the
/// readback's participle, AIM 4-4-7 b.1's example "Climbing to Flight
/// Level three three zero, United Twelve"), and a check-in's "with you".
/// Not "level" or "unable", which a controller says too.
const ACKNOWLEDGING: &[&str] = &["roger", "wilco", "affirmative", "climbing", "descending", "leaving", "turning", "switching"];

/// Who said `text`, the airplane being `tail`.
pub fn who(text: &str, tail: &str) -> Who {
    let said = spans(text, tail);
    if said.is_empty() {
        return Who::Other;
    }
    let words = words_of(text);
    let acknowledging = words.iter().any(|w| ACKNOWLEDGING.contains(&w.as_str()))
        || words.windows(2).any(|p| p[0] == "with" && p[1] == "you");
    let first = our_call(text, tail);
    let last = said.iter().any(|s| s.last() && !s.first());
    if last || (first && acknowledging) {
        Who::FromUs
    } else if first {
        Who::ToUs
    } else {
        Who::Other
    }
}
