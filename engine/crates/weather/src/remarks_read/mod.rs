//! An airport's remarks read into words (`remarks_read`): its fuel's, its
//! FBO's and its courtesy car's, as the Chart Supplement prints them (NASR
//! APT_RMK.csv, the same text). KPWK's "CUST CLNC 2 HR PPR -
//! 847-894-7292. TSNT UTILIZE FBO AFT CLR CUST. FBO CBP USER FEE." reads
//! "Customs clearance 2 hours prior permission required - 847-894-7292.
//! Transient utilize FBO after clearing customs. FBO CBP user fee."
//!
//! Each word is written out where it is a contraction of one meaning (the
//! Chart Supplement's Abbreviations, then JO 7340.2R: crate::contractions'
//! REMARKS and TABLE); a code (FBO, CBP, CTAF, 100LL, Jet A's A), a figure,
//! a time and a telephone number are kept as written; any other word is
//! set in lower case, the sentence started with a capital, as the app's
//! faa_words sets the FAA's capitals in sentence case. A word it does not
//! know is kept, never guessed.
//!
//! The sentence reader here (`sentences`, `said`) is lighting_read's too,
//! whose sentences not read as systems are said in words the same way.

#[cfg(test)]
mod tests;

use crate::contractions::{is_code, remarks_written};
use crate::json::{self, Value};
use crate::lighting_read::lexicon::{is_designator, schedule};

/// The sentences of a remark, a stop between each; a stop between figures
/// (122.8) is a frequency's.
pub fn sentences(text: &str) -> Vec<String> {
    let text = text.replace('—', " - ").replace('–', "-");
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    for (k, &c) in chars.iter().enumerate() {
        let decimal = k > 0 && chars[k - 1].is_ascii_digit() && chars.get(k + 1).is_some_and(char::is_ascii_digit);
        if c == '.' && !decimal {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out.into_iter().map(|s| s.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|s| !s.is_empty()).collect()
}

/// A sentence said in words: `word` says the word at an index of its words
/// (each without the comma, semicolon or colon after it) and how many it
/// took, its last one's stop kept after it; the first letter a capital and
/// a full stop at the end.
pub fn said(sentence: &str, mut word: impl FnMut(&[&str], usize) -> (String, usize)) -> String {
    let all: Vec<&str> = sentence.split_whitespace().collect();
    let cores: Vec<&str> = all.iter().map(|w| w.trim_end_matches([',', ';', ':'])).collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < all.len() {
        let (words, n) = word(&cores, i);
        let last = i + n.clamp(1, all.len() - i) - 1;
        out.push(words + &all[last][cores[last].len()..]);
        i = last + 1;
    }
    let mut text = out.join(" ");
    if let Some(first) = text.get(..1) {
        text = first.to_ascii_uppercase() + &text[1..];
    }
    text + "."
}

/// The short words of plain English the remarks use, set in lower case;
/// any other of three letters or fewer is a code or an ident (FBO, CBP,
/// DSN, JET A), kept.
const PLAIN_SHORT: &str = "AND TO FOR ON AT OF THE IS ARE OR BY IN ALL LOW OFF NO NOT FEE CAN MAY BE IF UP AN AS HAS OUT DUE PER CAR \
                           USE ANY ONE TWO DAY PAD HOT TIE NEW OWN GET PAY SEE LOT VIA OIL GAS WILL";

/// A word alone: written out, kept, or in lower case (the module's notes).
fn one(w: &str) -> String {
    match remarks_written(w) {
        Some("") => w.to_owned(),
        Some(full) => full.to_owned(),
        // A figure, and a fuel's grade by its sign ("A++", "JETA+").
        None if is_code(w) || is_designator(w) || w.bytes().any(|b| b.is_ascii_digit() || b == b'+') => w.to_owned(),
        None if w.len() <= 3 && !PLAIN_SHORT.split(' ').any(|s| s == w) => w.to_owned(),
        None => w.to_ascii_lowercase(),
    }
}

/// The word at `i` of a sentence's words, and how many it took: two read
/// as one ("CLR CUST"), a span of times ("0800-1700", "0800 to 1700"), a
/// figure and its unit run together ("24HR", "24 hours"), words joined by a
/// hyphen or a slash each read ("MON-FRI", "SELF-SVC"), or one.
fn word(w: &[&str], i: usize) -> (String, usize) {
    if let Some(two) = w.get(i + 1).and_then(|n| remarks_written(&format!("{} {n}", w[i]))) {
        return (two.to_owned(), 2);
    }
    // A word in brackets read as one without: "(NO FEES)".
    let c = w[i].strip_prefix('(').unwrap_or(w[i]);
    let open = &w[i][..w[i].len() - c.len()];
    let c = c.strip_suffix(')').unwrap_or(c);
    let close = &w[i][open.len() + c.len()..];
    let (said, n) = alone(w, i, c);
    (format!("{open}{said}{close}"), n)
}

/// `word` of a word `c`, out of its brackets.
fn alone(w: &[&str], i: usize, c: &str) -> (String, usize) {
    if let Some(span) = schedule(c) {
        return (span, 1);
    }
    // "1 HR" an hour, any other figure hours (the table's plural).
    if matches!(c, "HR" | "HRS") && i > 0 && w[i - 1] == "1" {
        return ("hour".to_owned(), 1);
    }
    let figure = c.trim_end_matches(|ch: char| ch.is_ascii_alphabetic());
    let unit = &c[figure.len()..];
    if !figure.is_empty()
        && figure.bytes().all(|b| b.is_ascii_digit())
        && !unit.is_empty()
        && !is_code(c)
        && let Some(full) = remarks_written(unit).filter(|f| !f.is_empty())
    {
        let full = if figure == "1" && full == "hours" { "hour" } else { full };
        return (format!("{figure} {full}"), 1);
    }
    let joined = c.contains(['-', '/']) && remarks_written(c).is_none() && !is_code(c);
    let parts: Vec<&str> = c.split(['-', '/']).collect();
    if joined && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_alphabetic())) {
        let mut out = String::new();
        let mut at = 0;
        for p in parts {
            out.push_str(&one(p));
            at += p.len();
            out.push_str(c.get(at..at + 1).unwrap_or_default());
            at += 1;
        }
        return (out, 1);
    }
    (one(c), 1)
}

/// A remark as sent, in words: each sentence said (`word`), the sentences
/// a space apart. One with any lower case is someone's own writing: as
/// sent.
pub fn read(remark: &str) -> String {
    let remark = remark.trim();
    if remark.bytes().any(|b| b.is_ascii_lowercase()) {
        return remark.to_owned();
    }
    sentences(remark).iter().map(|s| said(s, word)).collect::<Vec<_>>().join(" ")
}

/// `remarks_read`: `{"remarks": [...]}` to `{"lines": [...]}`, a line for
/// each remark in its order.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "remarks_read" {
        return Err(format!("{name}: not a rule of remarks_read"));
    }
    let remarks = v.get("remarks").and_then(Value::as_array).ok_or("remarks_read: \"remarks\" is missing")?;
    let mut out = String::from("{\"lines\":[");
    for (k, r) in remarks.iter().filter_map(Value::as_str).enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, &read(r));
    }
    out.push_str("]}");
    Ok(out)
}
