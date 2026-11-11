//! A NOTAM read for a pilot (`notam_read`): what it is about, as a plain
//! heading from its keyword, its words written out in sentence case
//! (body), and when it is in force, in UTC. The text as sent is never
//! changed; this is said beside it.
//!
//! The two forms a NOTAM comes in (crate::notam reads them for their
//! number, place and times):
//!
//! - the domestic form, FAA Order JO 7930.2 (Notices to Air Missions)
//!   4-2-1: "!" and the accountability, the number, the location, then the
//!   keyword (1-2-1: RWY, TWY, APRON, AD, OBST, NAV, COM, SVC, AIRSPACE,
//!   ODP, SID, STAR, CHART, DATA, DVA, IAP, VFP, ROUTE, SPECIAL or
//!   SECURITY), the condition, a schedule where it needs one, and the
//!   start of activity and end of validity, YYMMDDHHMM in UTC (3-3-2),
//!   the end followed by EST where it is an estimate or PERM where the
//!   condition is permanent (4-2-1): "!OSH 11/041 OSH RWY 18/36 CLSD
//!   2511120900-2511121700";
//! - the ICAO form (JO 7930.2 chapter 8, Annex 15): its Q) line, whose
//!   code's second and third letters name the subject (JO 7930.2 Appendix
//!   B: MR runway, MX taxiway, OB obstacle, PI instrument approach ...),
//!   A) the place, B) and C) the times (YYMMDDHHMM, C) with EST or PERM),
//!   D) a schedule, E) the words, F) and G) the lower and upper limits.
//!
//! What is not read is said as written: a word the table does not know
//! stays the word it was, and a NOTAM in neither form is its words alone.

mod body;
#[cfg(test)]
mod tests;
mod title;

use crate::contractions::{listed, lookup};
use crate::json::{self, Value};

/// JO 7930.2 1-2-1's keywords, each as a plain heading.
const KEYWORDS: &str = concat!(
    "RWY:Runway\n", "TWY:Taxiway\n", "APRON:Apron\n", "AD:Aerodrome\n", "OBST:Obstacle\n", "NAV:Navaid\n", "COM:Communications\n",
    "SVC:Services\n", "AIRSPACE:Airspace\n", "ODP:Departure procedure\n", "SID:SID\n", "STAR:STAR\n", "CHART:Chart\n", "DATA:Data\n",
    "DVA:Diverse vector area\n", "IAP:Instrument approach\n", "VFP:Visual flight procedure\n", "ROUTE:Route\n",
    "SPECIAL:Special procedure\n", "SECURITY:Security\n",
);

/// The keywords whose words begin with a place's name ("IAP CHICAGO
/// O'HARE INTL, CHICAGO, IL. VOR RWY 22R ..."; JO 7930.2 7-1-3).
const NAMED: &str = "IAP ODP SID STAR SPECIAL DVA CHART VFP";

/// A NOTAM read.
#[derive(Debug, Default, PartialEq)]
pub struct NotamRead {
    /// "domestic", "icao" or "text" (neither form).
    pub form: &'static str,
    pub number: Option<String>,
    pub location: Option<String>,
    pub keyword: Option<String>,
    pub heading: Option<String>,
    /// The thing it is about, named by its subject's words (title):
    /// "Runway 06/24", "Taxiway A"; None where they name none.
    pub title: Option<String>,
    pub words: String,
    pub starts: Option<String>,
    pub ends: Option<String>,
    pub estimated: bool,
    pub permanent: bool,
}

/// "2511120900", and "2511121700EST", as ISO 8601 UTC and whether it is
/// an estimate, read as crate::notam reads the feed's own times (which
/// give the century: this century's, as JO 7930.2's YY is); None where it
/// is not a real time.
fn utc10(t: &str) -> (Option<String>, bool) {
    let digits = t.strip_suffix("EST").unwrap_or(t);
    if digits.len() != 10 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return (None, false);
    }
    crate::notam::utc12(&["20", t].concat())
}

/// An end of validity: a time, a time and EST, or PERM.
fn end_of(t: &str, r: &mut NotamRead) -> bool {
    let t = t.trim();
    if t == "PERM" {
        r.permanent = true;
        return true;
    }
    let (at, est) = utc10(t);
    let ok = at.is_some();
    if ok {
        (r.ends, r.estimated) = (at, est);
    }
    ok
}

/// The domestic form's start and end ("2511120900-2511121700EST"; the
/// FDC NOTAMs' "2511120900 - 2511121700EST" is made one word first) among
/// `words`: the last, its index, its times put in `r`.
fn window(words: &[&str], r: &mut NotamRead) -> Option<usize> {
    words.iter().rposition(|w| {
        let Some((a, b)) = w.split_once('-') else { return false };
        let (Some(starts), false) = utc10(a) else { return false };
        let mut read = NotamRead::default();
        let ok = end_of(b.trim_end_matches(['.', ',']), &mut read);
        if ok {
            (r.starts, r.ends, r.estimated, r.permanent) = (Some(starts), read.ends, read.estimated, read.permanent);
        }
        ok
    })
}

/// "11/041", "M0061/26", "5/1234": a domestic NOTAM's number.
fn is_number(w: &str) -> bool {
    let b = w.as_bytes();
    let b = if b.first().is_some_and(u8::is_ascii_uppercase) { &b[1..] } else { b };
    let slash = b.iter().position(|&c| c == b'/').unwrap_or(0);
    slash > 0 && slash + 1 < b.len() && b.iter().enumerate().all(|(k, c)| k == slash || c.is_ascii_digit())
}

fn heading_of(keyword: &str) -> Option<&'static str> {
    lookup(KEYWORDS, keyword)
}

/// "MT..AIRSPACE": the FDC TFRs' double stops (JO 7930.2 7-1-5) apart
/// as words, a stop and a space; an ellipsis ("AMDT 8B...") kept.
fn spaced(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut dots = 0;
    for ch in text.chars().chain(std::iter::once(' ')) {
        if ch == '.' {
            dots += 1;
            continue;
        }
        match dots {
            0 => {}
            2 => out.push_str(". "),
            n => out.push_str(&".".repeat(n)),
        }
        dots = 0;
        out.push(ch);
    }
    out.truncate(out.trim_end().len());
    out
}

/// The words after the keyword, written out: a procedure's place's name
/// first (NAMED, and a TFR's) as a name is written, the rest by body.
fn said(words: &[&str], keyword: Option<&str>, tfr: bool, cx: &body::Context) -> String {
    let named = tfr || keyword.is_some_and(|k| listed(NAMED, k));
    // The name runs to its state's stop ("..., IL."), within a few words.
    let name_end = words.iter().take(12).position(|w| w.ends_with('.') && !w.ends_with("..")).filter(|_| named);
    let cx = body::Context { obstacle: keyword == Some("OBST"), ..*cx };
    match name_end {
        Some(end) => finished(&[body::title(&words[..=end]), body::rewrite(&words[end + 1..], &cx)], false),
        None => body::rewrite(words, &cx),
    }
}

/// A word with the stops and brackets around it off.
pub(crate) fn bare(w: &str) -> &str {
    w.trim_matches(|c: char| matches!(c, ',' | '.' | ';' | ':' | '(' | ')'))
}

fn domestic(text: &str, idents: &[String]) -> NotamRead {
    let spaced = spaced(text).replace(" - ", "-");
    let words: Vec<&str> = spaced.split_whitespace().collect();
    let mut r = NotamRead { form: "text", ..NotamRead::default() };
    // The heading: "!ACCOUNT NUMBER LOCATION".
    let mut start = 0;
    if words.len() >= 3 && is_number(words[1]) {
        (r.form, r.number, r.location, start) = ("domestic", Some(words[1].to_owned()), Some(words[2].to_owned()), 3);
    }
    let (body_end, tail) = match window(&words[start..], &mut r) {
        Some(at) => (start + at, start + at + 1),
        None => (words.len(), words.len()),
    };
    let at = words[start..body_end].iter().position(|w| heading_of(bare(w)).is_some()).map(|k| start + k);
    let tfr = text.contains("TEMPORARY FLIGHT RESTRICTION");
    let kw = at.map(|k| bare(words[k]));
    r.keyword = kw.map(str::to_owned);
    r.heading = kw.and_then(heading_of).map(|h| if tfr { "Temporary flight restriction" } else { h }.to_owned());
    // A surface's keyword is the start of its words ("Runway 18/36
    // closed"); another's is said by its heading alone.
    let first = match (at, kw) {
        (Some(k), Some("RWY" | "TWY" | "APRON")) => k,
        (Some(k), _) => k + 1,
        _ => start,
    };
    let cx = body::Context { idents, location: r.location.as_deref(), obstacle: false };
    // What may stand between the location and the keyword: (U),
    // unverified (1-2-1), kept; a TFR's state ("MT..") its place's name
    // says again.
    let unverified = if words[start..at.unwrap_or(start)].contains(&"(U)") { "(U)" } else { "" };
    let parts = [unverified.to_owned(), said(&words[first..body_end], kw, tfr, &cx), said(&words[tail..], None, false, &cx)];
    r.words = finished(&parts, true);
    r
}

/// The parts joined; with `stop`, ending as a sentence ends.
fn finished(parts: &[String], stop: bool) -> String {
    let mut words = String::new();
    for p in parts.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
        if !words.is_empty() {
            words.push(' ');
        }
        words.push_str(p);
        if stop && !p.ends_with(['.', ')']) {
            words.push('.');
        }
    }
    words
}

/// The ICAO form's item `letter` ("A)" to the next item), or None.
pub(crate) fn item(text: &str, letter: u8) -> Option<&str> {
    let b = text.as_bytes();
    let is_item = |i: usize| b"QABCDEFG".contains(&b[i]) && b[i + 1] == b')' && (i == 0 || b[i - 1].is_ascii_whitespace());
    let from = (0..b.len().saturating_sub(1)).find(|&i| b[i] == letter && is_item(i))? + 2;
    let to = (from..b.len().saturating_sub(1)).find(|&i| is_item(i)).unwrap_or(b.len());
    Some(text[from..to].trim())
}

/// The ICAO Q) code's subjects as headings (JO 7930.2 Appendix B, its
/// second and third letters, else the second alone: M movement and landing
/// area, F facilities and services, L lighting, I ILS, N navaids, G GNSS, C
/// communications, S air traffic services, A airspace organisation, R
/// airspace restrictions, W warnings), a line each.
const SUBJECTS: &str = concat!(
    "MR:Runway\nMX:Taxiway\nMN:Apron\nOB:Obstacle\nOL:Obstacle\nPI:Instrument approach\nPD:SID\nPA:STAR\n",
    "RT:Temporary flight restriction\nM:Aerodrome\nF:Aerodrome\nL:Aerodrome\nI:Navaid\nN:Navaid\nG:Navaid\n",
    "C:Communications\nS:Services\nA:Airspace\nR:Airspace\nW:Airspace",
);

/// The Q) code's subject as a heading: where E) begins with no keyword.
fn subject(q: &str) -> Option<&'static str> {
    let s = q.split('/').nth(1)?.get(1..3)?;
    lookup(SUBJECTS, s).or_else(|| lookup(SUBJECTS, &s[..1]))
}

fn icao(text: &str, idents: &[String]) -> NotamRead {
    let mut r = NotamRead { form: "icao", ..NotamRead::default() };
    r.number = text.split_whitespace().next().map(|w| w.trim_start_matches('(')).filter(|w| is_number(w)).map(str::to_owned);
    r.location = item(text, b'A').and_then(|a| a.split_whitespace().next()).map(str::to_owned);
    r.starts = item(text, b'B').and_then(|b| utc10(b).0);
    if let Some(c) = item(text, b'C') {
        end_of(&c.replace(' ', ""), &mut r);
    }
    let words: Vec<&str> = item(text, b'E').unwrap_or("").split_whitespace().collect();
    let kw = words.first().map(|w| bare(w)).filter(|w| heading_of(w).is_some());
    r.keyword = kw.map(str::to_owned);
    r.heading = kw.and_then(heading_of).or_else(|| item(text, b'Q').and_then(subject)).map(str::to_owned);
    let cx = body::Context { idents, location: r.location.as_deref(), obstacle: false };
    let first = usize::from(kw.is_some_and(|k| !matches!(k, "RWY" | "TWY" | "APRON"))).min(words.len());
    let mut parts = vec![said(&words[first..], kw, false, &cx)];
    if let Some(d) = item(text, b'D') {
        parts.push(["Schedule: ", &said(&d.split_whitespace().collect::<Vec<_>>(), None, false, &cx)].concat());
    }
    if let (Some(f), Some(g)) = (item(text, b'F'), item(text, b'G')) {
        // AMSL is MSL, which a span's levels say by themselves.
        let limits = [f.replace(' ', "").as_str(), "-", g.replace("AMSL", "").trim()].concat();
        parts.push(said(&limits.split_whitespace().collect::<Vec<_>>(), None, false, &cx));
    }
    r.words = finished(&parts, true);
    r
}

/// The NOTAM's text, as sent, read; `idents` are the field's, kept as
/// written in its words.
pub fn read(text: &str, idents: &[String]) -> NotamRead {
    let t = text.trim();
    // Words with any lower case are someone's own writing: said as sent.
    if t.bytes().any(|b| b.is_ascii_lowercase()) {
        return NotamRead { form: "text", words: t.to_owned(), ..NotamRead::default() };
    }
    let mut r = if t.contains("Q)") || t.contains("E)") { icao(t, idents) } else { domestic(t, idents) };
    r.title = title::title(t);
    r
}

/// `notam_read`: `{"text", "idents"?}` to `{"form", "number", "location",
/// "keyword", "heading", "title", "words", "starts", "ends", "estimated",
/// "permanent"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notam_read" {
        return Err(format!("{name}: not a rule of notam_read"));
    }
    let text = v.get("text").and_then(Value::as_str).ok_or("notam_read: \"text\" is missing")?;
    let idents: Vec<String> =
        v.get("idents").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).map(str::to_owned).collect();
    let r = read(text, &idents);
    let mut out = String::from("{");
    let fields = [
        ("form", Some(r.form)),
        ("number", r.number.as_deref()),
        ("location", r.location.as_deref()),
        ("keyword", r.keyword.as_deref()),
        ("heading", r.heading.as_deref()),
        ("title", r.title.as_deref()),
        ("words", Some(r.words.as_str())),
        ("starts", r.starts.as_deref()),
        ("ends", r.ends.as_deref()),
    ];
    for (key, value) in fields {
        out.push('"');
        out.push_str(key);
        out.push_str("\":");
        json::opt_string(&mut out, value);
        out.push(',');
    }
    out.push_str(if r.estimated { "\"estimated\":true," } else { "\"estimated\":false," });
    out.push_str(if r.permanent { "\"permanent\":true}" } else { "\"permanent\":false}" });
    Ok(out)
}
