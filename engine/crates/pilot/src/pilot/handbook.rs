//! The planning figures in a handbook's specifications page, from the text
//! read off a photo of it (the web app's Tesseract, the iPhone's Vision):
//! the page's own lines, each a label and its figure ("Service Ceiling
//! (ft) 14,300", "SERVICE CEILING .... 13,500 FT."), as Piper's and
//! Cessna's handbooks print them. Each figure comes with the line it was
//! read from, for the pilot to check against the page; one the page does
//! not label plainly is not guessed.
//!
//! The web app's lib/handbookText, moved here whole; its regular
//! expressions are matched by hand, each as JavaScript matches it (ASCII
//! case folding, `\b` between [A-Za-z0-9_] and the rest), since the
//! engine has no regular expression crate.

use super::js;
use crate::json;
use wingtip_core::units::NM_PER_SM;

/// A figure and the line it was read from.
#[derive(Clone, Debug, PartialEq)]
pub struct Figure {
    pub value: f64,
    pub words: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Figures {
    pub cruise_tas_kt: Option<Figure>,
    pub cruise_power_pct: Option<Figure>,
    pub fuel_burn_gph: Option<Figure>,
    pub usable_fuel_gal: Option<Figure>,
    pub climb_tas_kt: Option<Figure>,
    pub service_ceiling_ft: Option<Figure>,
}

fn chars(s: &str) -> Vec<char> {
    s.chars().collect()
}

fn digit_run(c: &[char], from: usize) -> usize {
    c[from.min(c.len())..].iter().take_while(|x| x.is_ascii_digit()).count()
}

fn space_run(c: &[char], from: usize) -> usize {
    c[from.min(c.len())..].iter().take_while(|&&x| js::is_space(x)).count()
}

/// The page's lines, a label wrapped onto the next line put back on one:
/// a line with a bracket left open, or with no figure at its end, goes on
/// with the next ("Cruising Speed (75% power, sea" / "level) (mph) 121").
pub fn entries(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut open = String::new();
    for raw in text.split('\n') {
        let raw = raw.strip_suffix('\r').unwrap_or(raw);
        // Every run of space one space, and none at the ends.
        let line = raw.split(js::is_space).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            continue;
        }
        let joined = if open.is_empty() { line } else { format!("{open} {line}") };
        let unclosed = joined.matches('(').count() > joined.matches(')').count();
        if (unclosed || !ends_with_figure(&joined)) && js::units(&joined) < 160 {
            open = joined;
            continue;
        }
        out.push(joined);
        open.clear();
    }
    if !open.is_empty() {
        out.push(open);
    }
    out
}

/// /\d[\d,.]*\D{0,12}$/: a figure, then no more than twelve code units
/// that are not digits to the end of the line.
fn ends_with_figure(line: &str) -> bool {
    let units: Vec<u16> = line.encode_utf16().collect();
    let is_digit = |u: u16| (b'0' as u16..=b'9' as u16).contains(&u);
    let Some(last) = units.iter().rposition(|&u| is_digit(u)) else { return false };
    let after = &units[last + 1..];
    let marks = after.iter().take_while(|&&u| u == b',' as u16 || u == b'.' as u16).count();
    after.len() - marks <= 12
}

/// Every "(...)" made a space, as /\([^)]*\)/g replaces it: a bracket's
/// own figures are a label's ("(75% power, 7000 ft, mph)").
fn bare(line: &str) -> String {
    let c = chars(line);
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < c.len() {
        if c[i] == '('
            && let Some(close) = c[i + 1..].iter().position(|&x| x == ')')
        {
            out.push(' ');
            i += close + 2;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// A figure as printed: "14,300", "8.4", and "14.300" where the reading
/// took a thousands comma for a point.
pub fn number(s: &str) -> f64 {
    let t = s.replace(',', "");
    let b = t.as_bytes();
    let thousands = (b.len() == 5 || b.len() == 6)
        && b[b.len() - 4] == b'.'
        && b.iter().enumerate().all(|(i, d)| i == b.len() - 4 || d.is_ascii_digit());
    if thousands {
        js::number(&t.replacen('.', "", 1))
    } else {
        js::number(&t)
    }
}

/// The line's figure: its last number outside brackets, where a label's
/// own numbers sit inside them ("(75% power, 7000 ft, mph) 132 (135*)") or
/// before it ("75% Power at 8000 Ft ...... 124 KNOTS"); /\d[\d,]*(?:\.\d+)?/g.
pub fn figure(line: &str) -> Option<f64> {
    let c = chars(&bare(line));
    let mut last: Option<String> = None;
    let mut i = 0;
    while i < c.len() {
        if !c[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let mut j = i + 1 + c[i + 1..].iter().take_while(|x| x.is_ascii_digit() || **x == ',').count();
        if c.get(j) == Some(&'.') && c.get(j + 1).is_some_and(char::is_ascii_digit) {
            j += 1 + digit_run(&c, j + 1);
        }
        last = Some(c[i..j].iter().collect());
        i = j;
    }
    last.map(|s| number(&s))
}

/// /\bmph\b|miles per hour|\bm\.?p\.?h\b/i.
fn says_mph(c: &[char]) -> bool {
    js::contains_ci(c, "miles per hour") || ["mph", "m.ph", "mp.h", "m.p.h"].iter().any(|w| js::has_word_ci(c, w))
}

/// Knots, from a line that says miles an hour where it does: its own
/// units, outside brackets, first -- "122 KTS (140 MPH)" is knots, its
/// bracketed miles an hour a second reading of the same speed -- and a
/// unit in brackets only where none is outside them, as Piper's "Best
/// Rate of Climb Speed (mph) 85" puts it.
pub fn knots(line: &str, value: f64) -> f64 {
    let b = chars(&bare(line));
    if ["kt", "kts", "knot", "knots", "ktas"].iter().any(|w| js::has_word_ci(&b, w)) {
        return value;
    }
    if says_mph(&b) || says_mph(&chars(line)) {
        js::round(value * NM_PER_SM)
    } else {
        value
    }
}

/// The power a line states, /(\d{2,3})\s*%/: NaN where it states none.
pub fn power(line: &str) -> f64 {
    let c = chars(line);
    for i in 0..c.len() {
        let run = digit_run(&c, i);
        if run >= 2 {
            let n = run.min(3);
            let after = i + n;
            if c.get(after + space_run(&c, after)) == Some(&'%') {
                return js::number(&c[i..i + n].iter().collect::<String>());
            }
        }
    }
    f64::NAN
}

fn within(n: Option<f64>, min: f64, max: f64) -> bool {
    n.is_some_and(|n| n.is_finite() && n >= min && n <= max)
}

/// The bounds a light airplane's figure is believed within, each figure
/// by its answer's name: a figure read off a page, or typed in, outside
/// them is a misreading, not the airplane's. Climb fuel burn is not read
/// off a page, only typed in.
pub const BOUNDS: [(&str, f64, f64); 7] = [
    ("cruiseTasKt", 30.0, 400.0),
    ("cruisePowerPct", 40.0, 100.0),
    ("fuelBurnGph", 1.0, 100.0),
    ("usableFuelGal", 5.0, 500.0),
    ("climbTasKt", 30.0, 300.0),
    ("climbFuelBurnGph", 1.0, 150.0),
    ("serviceCeilingFt", 1000.0, 30000.0),
];

/// Whether a figure, by its name in BOUNDS, is within its bounds; a name
/// not there has none.
pub fn figure_within(key: &str, value: f64) -> Option<bool> {
    BOUNDS.iter().find(|(k, _, _)| *k == key).map(|(_, min, max)| within(Some(value), *min, *max))
}

fn bounded(n: Option<f64>, key: &str) -> bool {
    n.is_some_and(|n| figure_within(key, n) == Some(true))
}

mod says;
pub use says::*;
