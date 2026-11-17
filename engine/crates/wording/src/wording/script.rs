//! The radio calls for a route, worded as the AIM and AC 90-66C word them
//! (the roadmap's radio scripts, ACS PA.III.A): at each field the weather
//! broadcast to listen to first (AIM 4-1-13, ATIS), then the tower's or the
//! CTAF's calls by what the field has; flight following on the way (AIM
//! 4-1-15); and the arrival -- the approach control first into Class B or
//! C, the tower into Class D, the CTAF's self-announcing elsewhere, the
//! field's name at both ends of each (AC 90-66C 9.8.1). Figures as they
//! are spoken (AIM 4-2-8, 4-2-9): "three thousand five hundred", "runway
//! two seven", "Cessna Three Four Five Sierra Papa"; the phonetic alphabet
//! and "niner" are AIM 4-2-7's (TBL 4-2-2).
//!
//! Words in [brackets] are the pilot's to fill in: the ATIS letter, where
//! they are on the field. A script to practise from and to have on the
//! kneeboard -- a controller may ask for something else, and the pilot
//! says what they ask. The web's lib/radio had all of it (#482 phase 1);
//! the host now picks the runways (its runway picks and the wind, through
//! gonogo_runway_flown) and asks `radio_script` for the words.

use super::faa::title_case;
use super::radio::{ctaf_of, frequency_of, Frequency, MULTICOM_MHZ};
use crate::json::{self, Value};
use wingtip_brief::runway::pick::{compass_word, exit_for, runway_number};
use wingtip_route::motion::profile::descent_altitude;

const DIGITS: [&str; 10] = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"];

/// The ICAO phonetic alphabet (AIM 4-2-7, TBL 4-2-2).
fn letter(c: char) -> Option<&'static str> {
    const LETTERS: [&str; 26] = [
        "Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November",
        "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu",
    ];
    c.is_ascii_uppercase().then(|| LETTERS[(c as u8 - b'A') as usize])
}

fn capitalised(word: &str) -> String {
    let mut c = word.chars();
    c.next().map_or_else(String::new, |f| f.to_uppercase().collect::<String>() + c.as_str())
}

/// A registration as it is spoken after the airplane's make, the N
/// dropped (AIM 4-2-4): "N345SP" is "Three Four Five Sierra Papa".
pub fn spoken_tail(tail: &str) -> String {
    let upper = tail.trim().to_uppercase();
    let bare = match upper.strip_prefix('N') {
        Some(rest) if rest.starts_with(|c: char| c.is_ascii_digit()) => rest,
        _ => upper.as_str(),
    };
    bare.chars()
        .map(|c| match c.to_digit(10) {
            Some(d) => capitalised(DIGITS[d as usize]),
            None => letter(c).map_or_else(|| c.to_string(), str::to_owned),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The airplane's call sign: its make and its registration spoken, or its
/// make and a blank where the planner has no registration for it (AIM
/// 4-2-4).
pub fn call_sign(make: &str, tail: Option<&str>) -> String {
    match tail {
        Some(t) if !t.is_empty() => format!("{make} {}", spoken_tail(t)),
        _ => format!("{make} [your registration]"),
    }
}

/// An altitude below 18,000 ft as spoken (AIM 4-2-9): the thousands'
/// digits, then the hundreds -- "one zero thousand five hundred".
pub fn spoken_altitude(ft: f64) -> String {
    // JavaScript's Math.round, half up, as the web wrote it.
    let hundreds = (ft / 100.0 + 0.5).floor() as i64;
    let (thousands, rest) = (hundreds.div_euclid(10), hundreds.rem_euclid(10));
    let mut words = Vec::new();
    if thousands > 0 {
        let digits: Vec<&str> = thousands.to_string().chars().map(|d| DIGITS[d.to_digit(10).unwrap_or(0) as usize]).collect();
        words.push(format!("{} thousand", digits.join(" ")));
    }
    if rest > 0 {
        words.push(format!("{} hundred", DIGITS[rest as usize]));
    }
    if words.is_empty() {
        "zero".to_owned()
    } else {
        words.join(" ")
    }
}

/// A runway as spoken, digit by digit with its side (AIM 4-2-9): "two
/// seven", "niner left", "six" for runway 06.
pub fn spoken_runway(ident: &str) -> String {
    let number = runway_number(ident).to_uppercase();
    let digits: String = number.chars().take_while(char::is_ascii_digit).collect();
    let side = match &number[digits.len()..] {
        "L" => " left",
        "C" => " center",
        "R" => " right",
        "" => "",
        _ => return ident.to_owned(),
    };
    if digits.is_empty() {
        return ident.to_owned();
    }
    let said: Vec<&str> = digits.chars().map(|d| DIGITS[d.to_digit(10).unwrap_or(0) as usize]).collect();
    format!("{}{side}", said.join(" "))
}

/// JavaScript's \w: an ASCII letter, digit or underscore.
fn word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// `text` with every whole word of `words` (tried in order at each place,
/// as a regex alternation is) taken out; `fold` compares ignoring case.
fn drop_words(text: &str, words: &[&str], fold: bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    'scan: while i < chars.len() {
        if i == 0 || !word_char(chars[i - 1]) {
            for w in words {
                let wc: Vec<char> = w.chars().collect();
                let end = i + wc.len();
                if end > chars.len() {
                    continue;
                }
                let same = chars[i..end].iter().zip(&wc).all(|(a, b)| if fold { a.eq_ignore_ascii_case(b) } else { a == b });
                if same && (end == chars.len() || !word_char(chars[end])) {
                    i = end;
                    continue 'scan;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Runs of the characters `squeezed` says as one space.
fn squeeze(text: &str, squeezed: impl Fn(char) -> bool) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = false;
    for c in text.chars() {
        if squeezed(c) {
            if !run {
                out.push(' ');
            }
            run = true;
        } else {
            out.push(c);
            run = false;
        }
    }
    out
}

/// What a pilot calls a field: its name without "Airport", "International"
/// and the like -- "Waukegan" for Waukegan National Airport (AC 90-66C
/// 9.8.1 names the field in each call); its ident where nothing is left.
pub fn place_name(name: Option<&str>, ident: &str) -> String {
    let name = name.unwrap_or("");
    let cut = name.find(['-', '/', '(']).map_or(name, |at| &name[..at]);
    const WORDS: [&str; 11] = [
        "international", "national", "regional", "municipal", "county", "executive", "memorial", "airport", "airfield", "field", "airpark",
    ];
    let left = squeeze(&drop_words(cut, &WORDS, true), char::is_whitespace);
    let left = left.trim();
    if left.is_empty() {
        ident.to_owned()
    } else {
        left.to_owned()
    }
}

/// A frequency's facility as it is called: its description's own name
/// ("ROCKFORD TWR" is Rockford), else the field's.
fn facility_name(f: &Frequency, field: &str) -> String {
    const CODES: [&str; 18] = [
        "TWR", "TOWER", "GND", "GROUND", "APP", "DEP", "APCH", "APP/DEP", "A/D", "CLNC", "DEL", "CLD", "CTAF", "UNICOM", "ATIS", "AWOS",
        "ASOS", "RDO",
    ];
    let upper = f.description.as_deref().unwrap_or("").to_uppercase();
    let own = squeeze(&drop_words(&upper, &CODES, false), |c| c == '/' || c.is_whitespace());
    let own = own.trim();
    if own.is_empty() {
        field.to_owned()
    } else {
        title_case(own)
    }
}

/// A frequency as pilots write it: 120.7, 122.95, 124.475.
fn mhz_text(mhz: f64) -> String {
    let s = format!("{mhz:.3}");
    let s = s.strip_suffix('0').map_or(s.as_str(), |t| t.strip_suffix('0').unwrap_or(t));
    s.to_owned()
}

/// A field as the script reads it.
pub struct Field {
    pub ident: String,
    pub name: Option<String>,
    pub airspace_class: Option<String>,
    pub frequencies: Vec<Frequency>,
    pub pattern_altitude_ft: Option<f64>,
    /// The runway end taken off from and landed on, as the host picked it
    /// (its ident as painted, its traffic side), None where none has a
    /// heading.
    pub takeoff: Option<End>,
    pub landing: Option<End>,
}

pub struct End {
    pub ident: String,
    pub traffic: Option<String>,
}

pub struct Leg {
    pub from: String,
    pub to: String,
    pub true_course_deg: f64,
    pub altitude_ft: f64,
}

pub struct Call {
    pub to: String,
    pub mhz: Option<f64>,
    pub words: String,
    pub note: Option<String>,
    pub listen: bool,
}

pub struct Phase {
    pub title: String,
    pub ident: String,
    pub kind: &'static str,
    pub calls: Vec<Call>,
}

fn call(to: String, mhz: Option<f64>, words: String) -> Call {
    Call { to, mhz, words, note: None, listen: false }
}

fn of<'a>(f: &'a [Frequency], types: &[&str]) -> Option<&'a Frequency> {
    frequency_of(f, types).map(|i| &f[i])
}

/// The legs from one airport to the next: the first leg out of `from` to
/// the first leg into `to` after it.
fn hop_legs<'a>(legs: &'a [Leg], from: &str, to: &str) -> &'a [Leg] {
    let Some(start) = legs.iter().position(|l| l.from == from) else { return &[] };
    match legs[start..].iter().position(|l| l.to == to) {
        Some(end) => &legs[start..start + end + 1],
        None => &legs[start..],
    }
}

/// At a part-time tower, what to do when it is closed: its CTAF.
fn when_closed(f: &[Frequency]) -> String {
    of(f, &["CTAF"])
        .and_then(|c| c.mhz)
        .map_or_else(String::new, |mhz| format!(" When the tower is closed, self-announce on the CTAF, {}.", mhz_text(mhz)))
}

fn listen_first(f: &[Frequency], field: &str) -> Vec<Call> {
    if let Some(atis) = of(f, &["ATIS"]) {
        let mut c = call(format!("{field} ATIS"), atis.mhz, "The weather, the runway in use and the information letter.".into());
        c.listen = true;
        return vec![c];
    }
    if let Some(auto) = of(f, &["AWOS", "ASOS"]) {
        let kind = auto.kind.as_deref().unwrap_or("").to_uppercase();
        let mut c = call(format!("{field} {kind}"), auto.mhz, "The wind, the altimeter setting and the weather.".into());
        c.listen = true;
        return vec![c];
    }
    Vec::new()
}

fn runway_words(end: Option<&End>) -> String {
    end.map_or_else(|| "runway [in use]".to_owned(), |e| format!("runway {}", spoken_runway(&e.ident)))
}

fn busy(class: Option<&str>) -> bool {
    matches!(class, Some("B") | Some("C"))
}

/// The CTAF's frequency: the field's (wording::radio ctaf_of), else
/// MULTICOM's 122.9 (AC 90-66C 9.6).
fn ctaf_mhz(f: &[Frequency]) -> Option<f64> {
    ctaf_of(f).map_or(Some(MULTICOM_MHZ), |i| f[i].mhz)
}

mod legs;
pub use legs::*;
mod payload;
pub use payload::*;

#[cfg(test)]
mod tests;
