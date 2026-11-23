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
use super::{bare, read, spaced, NotamRead};
use crate::contractions::listed;
use crate::json::{self, Value};

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
    departure: bool,
}

#[derive(Debug, Default, PartialEq)]
pub struct Card {
    pub account: Option<String>,
    pub category: Option<String>,
    pub title: Option<String>,
    pub effect: Option<String>,
    pub permanent: bool,
    pub procedures: Vec<Procedure>,
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

/// The procedures its titles name, as the d-TPP charts them (7-1-3): a
/// name, its number as a word, DEPARTURE or ARRIVAL, and (RNAV) where it
/// is one: "ADELL EIGHT DEPARTURE (RNAV)" is "ADELL 8", RNAV.
fn procedures(words: &[&str]) -> Vec<Procedure> {
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

/// A surface closed among its words: "RWY 18/36 PERMANENTLY CLSD", "TWY
/// B CLSD" (3-3-5, 3-3-6; CLSD, JO 7340.2): "Runway 18/36", and whether
/// the words call it permanent.
fn closure(words: &[&str]) -> Option<(String, bool)> {
    words.windows(3).find_map(|p| {
        let named = match p[0] {
            "RWY" if is_runway(bare(p[1])) => "Runway",
            "TWY" if is_taxiway(bare(p[1])) => "Taxiway",
            _ => return None,
        };
        let perm = matches!(p[2], "PERMANENTLY" | "PERM");
        let closed = if perm { words.iter().skip_while(|w| **w != p[2]).nth(1).copied() } else { Some(p[2]) };
        (closed.map(bare) == Some("CLSD")).then(|| ([named, " ", bare(p[1])].concat(), perm))
    })
}

/// "closed", "out of service", ... in a what as the engine says it: the
/// conditions JO 7340.2's contractions write out, and an approach's
/// "not authorized" (NA).
const CONDITIONS: [&str; 6] = ["closed", "out of service", "not available", "unusable", "inoperative", "not authorized"];

/// A what ("Glide slope runway 09 out of service", "ILS RWY 36: not
/// authorized") as a sentence: "... is out of service.".
fn sentence_of(what: &str, permanent: bool) -> Option<String> {
    let (at, c) = CONDITIONS.iter().find_map(|c| what.find(&[" ", c].concat()).map(|at| (at, *c)))?;
    let subject = what[..at].trim_end_matches(':');
    let rest = &what[at + 1 + c.len()..];
    let plural = subject.starts_with("Taxiways") || subject.starts_with("Runways") || subject.contains(" and ");
    let verb = if plural { " are " } else { " is " };
    Some([subject, verb, if permanent { "permanently " } else { "" }, c, rest, "."].concat())
}

/// What the procedures are, in a sentence: "RNAV departures".
fn kind_of(p: &[Procedure]) -> String {
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

/// The NOTAM's `text`, as sent, read for its card.
pub fn card(text: &str, idents: &[String]) -> Card {
    let r = read(text, idents);
    let t = text.trim();
    let account = (r.form == "domestic").then(|| t.split_whitespace().next().map(|w| w.trim_start_matches('!').to_owned())).flatten();
    let spaced = spaced(t);
    let words: Vec<&str> = spaced.split_whitespace().collect();
    let procedures = procedures(&words);
    let na = words.iter().any(|w| bare(w) == "NA");
    let shut = closure(&words);
    let permanent = r.permanent || shut.as_ref().is_some_and(|(_, perm)| *perm);
    let perm = if permanent { "permanently " } else { "" };
    let taken = na && !procedures.is_empty();
    let one = |p: &Procedure| [p.name.as_str(), if p.departure { " departure" } else { " arrival" }].concat();
    let title = r.what.clone().or_else(|| shut.as_ref().map(|(s, _)| [s.as_str(), " closed"].concat())).or_else(|| {
        taken.then(|| match &procedures[..] {
            [p] => [one(p).as_str(), " not authorized"].concat(),
            ps => [ps.len().to_string().as_str(), " ", &kind_of(ps), " not authorized"].concat(),
        })
    });
    let effect = match (&shut, taken) {
        (Some((s, _)), true) => Some([s.as_str(), " is ", perm, "closed, so its ", &kind_of(&procedures), " are not authorized."].concat()),
        (Some((s, _)), false) => Some([s.as_str(), " is ", perm, "closed."].concat()),
        (None, true) => Some(match &procedures[..] {
            [p] => ["The ", one(p).as_str(), if p.rnav { " (RNAV)" } else { "" }, " is not authorized."].concat(),
            ps => ["These ", ps.len().to_string().as_str(), " ", &kind_of(ps), " are not authorized."].concat(),
        }),
        (None, false) => r.what.as_deref().and_then(|w| sentence_of(w, permanent)),
    };
    Card { account, category: category(&r), title, effect, permanent, procedures: if taken { procedures } else { vec![] } }
}

/// `notam_card`: `{"text", "idents"?}` to `{"account", "category",
/// "title", "effect", "permanent", "procedures": [{"name", "rnav"}]}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notam_card" {
        return Err(format!("{name}: not a rule of notam_card"));
    }
    let text = v.get("text").and_then(Value::as_str).ok_or("notam_card: \"text\" is missing")?;
    let idents: Vec<String> =
        v.get("idents").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).map(str::to_owned).collect();
    let c = card(text, &idents);
    let mut out = String::from("{");
    for (key, value) in [("account", &c.account), ("category", &c.category), ("title", &c.title), ("effect", &c.effect)] {
        out.push('"');
        out.push_str(key);
        out.push_str("\":");
        json::opt_string(&mut out, value.as_deref());
        out.push(',');
    }
    out.push_str(if c.permanent { "\"permanent\":true," } else { "\"permanent\":false," });
    out.push_str("\"procedures\":[");
    for (i, p) in c.procedures.iter().enumerate() {
        out.push_str(if i == 0 { "{\"name\":" } else { ",{\"name\":" });
        json::string(&mut out, &p.name);
        out.push_str(if p.rnav { ",\"rnav\":true}" } else { ",\"rnav\":false}" });
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FDC_6_3373: &str = "!FDC 6/3373 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV)... BLOKR EIGHT DEPARTURE (RNAV)... CARYN EIGHT DEPARTURE (RNAV)... DARCY EIGHT DEPARTURE (RNAV)... ELANR NINE DEPARTURE (RNAV)... OBENE THREE DEPARTURE (RNAV)... RWY 18/36 PROCEDURES NA. RWY 18/36 PERMANENTLY CLSD. 2605271843-2805271843EST";

    #[test]
    fn a_runway_closed_for_good_takes_its_departures_away() {
        let c = card(FDC_6_3373, &[]);
        assert_eq!(c.account.as_deref(), Some("FDC"));
        assert_eq!(c.category.as_deref(), Some("Departure procedures"));
        assert_eq!(c.title.as_deref(), Some("Runway 18/36 closed"));
        assert_eq!(c.effect.as_deref(), Some("Runway 18/36 is permanently closed, so its RNAV departures are not authorized."));
        assert!(c.permanent);
        let names: Vec<&str> = c.procedures.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["ADELL 8", "BLOKR 8", "CARYN 8", "DARCY 8", "ELANR 9", "OBENE 3"]);
        assert!(c.procedures.iter().all(|p| p.rnav));
    }

    #[test]
    fn each_kind_says_its_effect_or_none() {
        // A runway (JO 7930.2 5-1-3 c), for now: not permanent.
        let c = card("!OSH 11/041 OSH RWY 18/36 CLSD 2511120900-2511121700", &[]);
        assert_eq!((c.title.as_deref(), c.effect.as_deref()), (Some("Runway 18/36 closed"), Some("Runway 18/36 is closed.")));
        assert_eq!((c.category.as_deref(), c.permanent, c.procedures.len()), (Some("Runway"), false, 0));
        // A navaid's part (NAV; AIM 1-1-9).
        let c = card("!OSH 11/081 OSH NAV ILS RWY 36 GP U/S 2511120000-2511202359", &[]);
        assert_eq!(c.effect.as_deref(), Some("Glide slope runway 36 is out of service."));
        // One arrival not authorized (STAR, 7-1-3).
        let c = card("!FDC 6/1 ORD STAR CHICAGO O'HARE INTL, CHICAGO, IL. BENKY SIX ARRIVAL NA. 2611010000-2612010000", &[]);
        assert_eq!(c.category.as_deref(), Some("Arrival procedures"));
        assert_eq!(c.title.as_deref(), Some("BENKY 6 arrival not authorized"));
        assert_eq!(c.effect.as_deref(), Some("The BENKY 6 arrival is not authorized."));
        // Permanent by its end (PERM, 4-2-1).
        let c = card("!OSH 11/090 OSH TWY B CLSD 2511120900-PERM", &[]);
        assert_eq!((c.effect.as_deref(), c.permanent), (Some("Taxiway B is permanently closed."), true));
        // Airspace it cannot structure: none, the words stand in.
        let c = card("!OSH 11/100 OSH AIRSPACE UAS WI AN AREA DEFINED AS 2NM RADIUS OF OSH SFC-400FT 2511120900-2511121700", &[]);
        assert_eq!((c.title, c.effect, c.category.as_deref()), (None, None, Some("Airspace")));
    }
}
