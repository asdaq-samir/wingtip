//! A NOTAM's own card (`notam_card`): what happened as its title, the
//! kind of thing it is about as a small label, one plain sentence of what
//! it means, the procedures it takes away, and whether the condition is
//! permanent. The owner, 2026-11-23, of FDC 6/3373 at KARR: title "Runway
//! 18/36 closed", label "Departure procedures", "Runway 18/36 is
//! permanently closed, so its RNAV departures are not authorized", and the
//! departures "ADELL 8 · BLOKR 8 ... (RNAV)".
//!
//! Each is read from the NOTAM's own parts (FAA Order JO 7930.2: its
//! keyword, 1-2-1; a surface and its condition, 3-3-5 and 3-3-6, CLSD and
//! NA in JO 7340.2's contractions; an FDC procedure NOTAM's titles,
//! 7-1-3; PERM, 4-2-1) and said only where they say all of it: a part it
//! cannot read is None, and the card then says the NOTAM's words written
//! out (notam_read's), never a guess.

use super::body::{is_runway, is_taxiway};
#[path = "card_procedures.rs"]
mod procs;
use super::{bare, read, spaced, NotamRead};
use crate::json::{self, Value};
pub(in crate::notam_read) use procs::procedure_word;
pub use procs::Procedure;
use procs::{kind_of, procedures, taken_by, Taken};

#[derive(Debug, Default, PartialEq)]
pub struct Card {
    pub account: Option<String>,
    pub category: Option<String>,
    pub title: Option<String>,
    pub effect: Option<String>,
    pub permanent: bool,
    /// It stays until the charts show it, so its end, where it has one, is
    /// only the estimate of when (until_charts).
    pub until_charts: bool,
    pub procedures: Vec<Procedure>,
}

/// Whether a permanent condition's end is "until the charts are
/// updated" (the owner's rule of 2026-11-23, FDC 6/3373, which the apps
/// had each kept): a PERM condition (JO 7930.2 4-2-1) stays until the
/// charts show it, and an end marked EST is only an estimate (4-2-1), so
/// a permanent one with an EST end, or with none, lasts until the charts
/// are updated, the EST time the estimate of when. A firm end is said as
/// its time. `has_end`: the text, or the caller (the feed's end), gives one.
pub fn until_charts(permanent: bool, estimated: bool, has_end: bool) -> bool {
    permanent && (estimated || !has_end)
}

/// The kind of thing it is about, as a label: a procedure NOTAM's by what
/// the procedures are for (SID and ODP departures, DVA's vectors too;
/// STAR arrivals; IAP approaches: JO 7930.2 1-2-1), the rest its heading.
fn category(r: &NotamRead) -> Option<String> {
    let by_kind = match r.keyword.as_deref() {
        Some("SID" | "ODP" | "DVA") => "Departure procedures",
        Some("STAR") => "Arrival procedures",
        Some("IAP") => "Instrument approaches",
        _ => return r.heading.clone(),
    };
    Some(by_kind.to_owned())
}

/// A procedure NOTAM's own sentence closing a surface: "RWY 18/36
/// PERMANENTLY CLSD." standing alone (3-3-5, 3-3-6; CLSD, JO 7340.2), as
/// FDC 6/3373 states it: "Runway 18/36", and whether it says permanent.
/// Only a whole sentence counts: a CLSD inside one ("... NA WHEN RWY 9/27
/// CLSD") is a condition, not a closure, and a RWY or TWY NOTAM's own
/// closure is notam_read's `what`, read from its subject (four), never
/// from the last surface before a CLSD (a taxiway's between-points, 3-3-6).
fn closure(sentences: &[Vec<&str>]) -> Option<(String, bool)> {
    sentences.iter().find_map(|s| {
        let s: Vec<&str> = s.iter().map(|w| bare(w)).collect();
        let (kind, d, perm) = match s[..] {
            [k, d, "CLSD"] => (k, d, false),
            [k, d, "PERM" | "PERMANENTLY", "CLSD"] => (k, d, true),
            _ => return None,
        };
        let named = match kind {
            "RWY" if is_runway(d) => "Runway",
            "TWY" if is_taxiway(d) => "Taxiway",
            _ => return None,
        };
        Some(([named, " ", d].concat(), perm))
    })
}

/// The NOTAM's sentences, each its words as sent: split at its full stops
/// and the "..." between a procedure NOTAM's titles, but never at a
/// decimal point ("118.3", "2.5 NM"), which would cut a closure's sentence
/// in two and lose it.
fn sentences(t: &str) -> Vec<Vec<&str>> {
    let b = t.as_bytes();
    let digit = |i: Option<usize>| i.and_then(|i| b.get(i)).is_some_and(u8::is_ascii_digit);
    let mut out = Vec::new();
    let mut from = 0;
    for (i, &c) in b.iter().enumerate() {
        if c == b'.' && !(digit(i.checked_sub(1)) && digit(Some(i + 1))) {
            out.push(&t[from..i]);
            from = i + 1;
        }
    }
    out.push(&t[from..]);
    out.into_iter().map(|s| s.split_whitespace().collect::<Vec<_>>()).filter(|s| !s.is_empty()).collect()
}

/// "closed", "out of service", ... in a what as the engine says it: the
/// conditions JO 7340.2's contractions write out, and an approach's
/// "not authorized" (NA).
const CONDITIONS: [&str; 6] = ["closed", "out of service", "not available", "unusable", "inoperative", "not authorized"];

/// A what ("Glide slope runway 09 out of service", "ILS RWY 36: not
/// authorized") as a sentence: "... is out of service.".
fn sentence_of(what: &str, permanent: bool) -> Option<String> {
    // The condition met first in the words, not first in the list.
    let (at, c) = CONDITIONS.iter().filter_map(|c| what.find(&[" ", c].concat()).map(|at| (at, *c))).min_by_key(|(at, _)| *at)?;
    let subject = what[..at].trim_end_matches(':');
    let rest = &what[at + 1 + c.len()..];
    // A second condition after it ("Taxiway A unusable between taxiway B
    // and the ramp closed") makes no one sentence: none, so the card shows
    // the NOTAM's own words (the round 7 audit, E-L2).
    if CONDITIONS.iter().any(|c| rest.contains(&[" ", c].concat())) {
        return None;
    }
    let plural = subject.starts_with("Taxiways") || subject.starts_with("Runways") || subject.contains(" and ");
    let verb = if plural { " are " } else { " is " };
    Some([subject, verb, if permanent { "permanently " } else { "" }, c, rest, "."].concat())
}

/// The NOTAM's `text`, as sent, read for its card.
pub fn card(text: &str, idents: &[String]) -> Card {
    card_with_end(text, idents, false)
}

/// card, with whether the caller holds an end of its own (the feed's), so
/// a NOTAM whose text gives none is not said to run to the charts when the
/// feed gives a firm one.
pub fn card_with_end(text: &str, idents: &[String], known_end: bool) -> Card {
    let r = read(text, idents);
    let t = text.trim();
    let account = (r.form == "domestic").then(|| t.split_whitespace().next().map(|w| w.trim_start_matches('!').to_owned())).flatten();
    let category = category(&r);
    let spaced = spaced(t);
    let words: Vec<&str> = spaced.split_whitespace().collect();
    let parts = sentences(t);
    // A closure stated as a sentence of its own is a procedure NOTAM's
    // (SID, ODP, DVA, STAR, IAP; 1-2-1); a surface's NOTAM says its own.
    let procedure_notam = matches!(r.keyword.as_deref(), Some("SID" | "ODP" | "DVA" | "STAR" | "IAP"));
    let shut = if procedure_notam { closure(&parts) } else { None };
    // Permanent by its end (PERM) or in its words (PERMANENTLY CLSD), one
    // answer for every path below (the round 7 audit, E-L1).
    let permanent = r.permanent || shut.as_ref().is_some_and(|(_, perm)| *perm);
    let until_charts = until_charts(permanent, r.estimated, known_end || r.ends.is_some());
    let takes: Vec<Taken> = parts.iter().filter_map(|s| taken_by(s)).collect();
    if takes.contains(&Taken::Unsure) {
        // Part of something not authorized, which the card cannot say whole:
        // the NOTAM's words written out stand in.
        return Card { account, category, permanent, until_charts, ..Card::default() };
    }
    let named = procedures(&words);
    let runway = takes.iter().find_map(|k| if let Taken::Runway(d) = k { Some(d.clone()) } else { None });
    let every = runway.is_some() || takes.contains(&Taken::All);
    let procedures: Vec<Procedure> =
        if every { named } else { takes.into_iter().filter_map(|k| if let Taken::One(p) = k { Some(p) } else { None }).collect() };
    let perm = if permanent { "permanently " } else { "" };
    let taken = !procedures.is_empty();
    let one = |p: &Procedure| [p.name.as_str(), if p.departure { " departure" } else { " arrival" }].concat();
    let scope = runway
        .as_deref()
        .map_or(String::new(), |d| [if procedures.iter().all(|p| p.departure) { " from runway " } else { " for runway " }, d].concat());
    let title = r.what.clone().or_else(|| shut.as_ref().map(|(s, _)| [s.as_str(), " closed"].concat())).or_else(|| {
        taken.then(|| match &procedures[..] {
            [p] => [one(p).as_str(), " not authorized", &scope].concat(),
            ps => [ps.len().to_string().as_str(), " ", &kind_of(ps), " not authorized", &scope].concat(),
        })
    });
    let not_authorized = || match &procedures[..] {
        [p] => ["The ", one(p).as_str(), if p.rnav { " (RNAV)" } else { "" }, " is not authorized", &scope, "."].concat(),
        ps => ["These ", ps.len().to_string().as_str(), " ", &kind_of(ps), " are not authorized", &scope, "."].concat(),
    };
    let effect = match (&shut, taken) {
        // The runway closed is the one whose procedures are taken: "its".
        (Some((s, _)), true) if runway.as_deref().is_some_and(|d| s.split_once(' ').is_some_and(|(k, at)| k == "Runway" && at == d)) => {
            Some([s.as_str(), " is ", perm, "closed, so its ", &kind_of(&procedures), " are not authorized."].concat())
        }
        (Some((s, _)), true) => Some([s.as_str(), " is ", perm, "closed. ", &not_authorized()].concat()),
        // An approach's own "not authorized" is kept beside the closure.
        (Some((s, _)), false) => {
            let also = r.what.as_deref().and_then(|w| sentence_of(w, false)).map_or(String::new(), |w| [" ", w.as_str()].concat());
            Some([s.as_str(), " is ", perm, "closed.", &also].concat())
        }
        (None, true) => Some(not_authorized()),
        (None, false) => r.what.as_deref().and_then(|w| sentence_of(w, permanent)),
    };
    Card { account, category, title, effect, permanent, until_charts, procedures }
}

/// `notam_card`: `{"text", "idents"?, "ends"?}` to `{"account",
/// "category", "title", "effect", "permanent", "until_charts",
/// "procedures": [{"name", "rnav", "departure"}]}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notam_card" {
        return Err(format!("{name}: not a rule of notam_card"));
    }
    let text = v.get("text").and_then(Value::as_str).ok_or("notam_card: \"text\" is missing")?;
    let idents: Vec<String> =
        v.get("idents").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).map(str::to_owned).collect();
    let known_end = v.get("ends").and_then(Value::as_str).is_some_and(|e| !e.trim().is_empty());
    let c = card_with_end(text, &idents, known_end);
    let mut out = String::from("{");
    for (key, value) in [("account", &c.account), ("category", &c.category), ("title", &c.title), ("effect", &c.effect)] {
        out.push('"');
        out.push_str(key);
        out.push_str("\":");
        json::opt_string(&mut out, value.as_deref());
        out.push(',');
    }
    out.push_str(if c.permanent { "\"permanent\":true," } else { "\"permanent\":false," });
    out.push_str(if c.until_charts { "\"until_charts\":true," } else { "\"until_charts\":false," });
    out.push_str("\"procedures\":[");
    for (i, p) in c.procedures.iter().enumerate() {
        out.push_str(if i == 0 { "{\"name\":" } else { ",{\"name\":" });
        json::string(&mut out, &p.name);
        out.push_str(if p.rnav { ",\"rnav\":true" } else { ",\"rnav\":false" });
        out.push_str(if p.departure { ",\"departure\":true}" } else { ",\"departure\":false}" });
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
#[path = "card_tests.rs"]
mod tests;
