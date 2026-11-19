//! An approach taught as an instructor teaches it, at the owner's ask
//! ("do it all", 2026-10-30): briefed before anything moves, flown fix by
//! fix with a word at each, and asked back. All of it from the FAA's coded
//! procedure (wingtip.procedures, the CIFP) and the field's radio: what the
//! coded data does not hold -- the minimums above all -- is "See the
//! plate", never a figure made up. A training aid; the plate flies.
//!
//! The web's lib/approachLesson, ported line for line. Its sentences come
//! with it: nearly every one states the procedure's own figures -- a
//! crossing altitude, the course, the descent rate at a ground speed, the
//! miles and the time to the missed approach point, which minimums apply
//! -- and the quiz's wrong choices are the procedure's other values, so
//! the phone that teaches the lesson offline says and asks the very same.

use super::{Drawing, Fix, MissedLeg, FT_PER_NM};
use crate::figures::words::{alt_ft, bearing, feet, grouped, js_num, js_round_f, to_fixed};
use crate::geo::distance_nm;
use crate::motion::rad;
use crate::route::picks::{altitude_lines, Crossing};

/// "See the plate": what the lesson says where the coded data has nothing.
pub const SEE_THE_PLATE: &str = "See the plate";
const SEE_THE_PLATE_LOWER: &str = "see the plate";

/// The rate of descent that holds a path of `angle_deg` at a ground speed
/// of `gs_kt`, ft/min: the ground speed in feet a minute times the path's
/// tangent -- GS × 101.3 × tan(angle), about GS × 5.3 on a 3.00° path, the
/// FAA's Rate of Descent Table in the front of each Terminal Procedures
/// Publication (478 ft/min at 90 kt on 3.0°) and FAA-H-8083-16B, chapter 4.
pub fn descent_fpm(gs_kt: f64, angle_deg: f64) -> f64 {
    ((gs_kt * FT_PER_NM) / 60.0) * rad(angle_deg).tan()
}

/// A descent rate as a pilot sets it on the VSI: to the nearest 10 ft/min.
pub fn rounded_fpm(fpm: f64) -> f64 {
    js_round_f(fpm / 10.0) * 10.0
}

/// An airplane's approach category by its speed, 14 CFR 97.3: VREF, or
/// 1.3 × VSO where no VREF is specified, at the maximum certificated
/// landing weight -- A under 91 kt, B 91 to under 121, C 121 to under 141,
/// D 141 to under 166, E 166 and over. None with neither speed.
pub fn approach_category(vref_kt: Option<f64>, vso_kt: Option<f64>) -> Option<&'static str> {
    let speed = vref_kt.or(vso_kt.map(|v| 1.3 * v))?;
    // Not over zero (or not a number): no speed.
    if speed.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return None;
    }
    Some(if speed < 91.0 {
        "A"
    } else if speed < 121.0 {
        "B"
    } else if speed < 141.0 {
        "C"
    } else if speed < 166.0 {
        "D"
    } else {
        "E"
    })
}

/// Which minimums an approach is flown to, by its kind (AIM 5-4-5 and
/// FAA-H-8083-16B, chapter 4): a decision altitude on a precision approach
/// (ILS, GLS) and on an RNP AR one; an RNAV (GPS) one's lines are a DA
/// (LPV, LNAV/VNAV) or an MDA (LNAV); every other a minimum descent
/// altitude.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MinimumsKind {
    Da,
    Mda,
    DaOrMda,
}

impl MinimumsKind {
    pub fn key(self) -> &'static str {
        match self {
            MinimumsKind::Da => "DA",
            MinimumsKind::Mda => "MDA",
            MinimumsKind::DaOrMda => "DA or MDA",
        }
    }
}

/// Whether `name` starts with the word `word`: what follows it is not a
/// letter, a figure or "_" (a regular expression's \b).
fn starts_with_word(name: &str, word: &str) -> bool {
    name.strip_prefix(word).is_some_and(|rest| !rest.chars().next().is_some_and(|c| c.is_ascii_alphanumeric() || c == '_'))
}

pub fn minimums_kind(name: &str) -> MinimumsKind {
    if starts_with_word(name, "ILS") || starts_with_word(name, "GLS") || name.starts_with("RNAV (RNP)") {
        return MinimumsKind::Da;
    }
    if name.starts_with("RNAV (GPS)") || starts_with_word(name, "GPS") {
        return MinimumsKind::DaOrMda;
    }
    MinimumsKind::Mda
}

/// A fix as said aloud: a runway's threshold ("RW08") by its runway.
pub fn fix_name(ident: &str) -> String {
    let b = ident.as_bytes();
    let runway = b.len() >= 4
        && b.len() <= 5
        && ident.starts_with("RW")
        && b[2].is_ascii_digit()
        && b[3].is_ascii_digit()
        && (b.len() == 4 || matches!(b[4], b'L' | b'R' | b'C'));
    if runway {
        format!("the runway {} threshold", &ident[2..])
    } else {
        ident.to_owned()
    }
}

/// A time as a stopwatch says it: "2:05", as the web writes it.
pub fn stopwatch(seconds: f64) -> String {
    let whole = js_round_f(seconds);
    let secs = js_num(whole % 60.0);
    format!("{}:{}{secs}", js_num((whole / 60.0).floor()), if secs.chars().count() < 2 { "0" } else { "" })
}

/// The first letter capitalised, or lowered, as the sentences join.
fn upper_first(s: &str) -> String {
    let mut c = s.chars();
    c.next().map_or_else(String::new, |f| f.to_uppercase().collect::<String>() + c.as_str())
}

fn lower_first(s: &str) -> String {
    let mut c = s.chars();
    c.next().map_or_else(String::new, |f| f.to_lowercase().collect::<String>() + c.as_str())
}

/// The approach's own fixes in the order flown: its missed approach's left
/// out.
pub fn approach_fixes(d: &Drawing) -> Vec<&Fix> {
    d.fixes.iter().filter(|f| !f.missed).collect()
}

/// The procedure's line in the order flown -- its transition, its final,
/// then its missed approach -- each joint once.
pub fn lesson_path(d: &Drawing) -> Vec<(f64, f64)> {
    let mut path: Vec<(f64, f64)> = Vec::new();
    for role in ["transition", "final", "missed"] {
        for line in d.lines.iter().filter(|l| l.role == role) {
            for &p in &line.points {
                if path.last() != Some(&p) {
                    path.push(p);
                }
            }
        }
    }
    path
}

fn nm(a: (f64, f64), b: (f64, f64)) -> f64 {
    distance_nm(a.0, a.1, b.0, b.1)
}

/// The point of `path` nearest `at`, from `from` on.
fn nearest_from(path: &[(f64, f64)], at: (f64, f64), from: usize) -> usize {
    let (mut best, mut best_nm) = (from, f64::INFINITY);
    for (i, &p) in path.iter().enumerate().skip(from) {
        let d = nm(p, at);
        if d < best_nm {
            (best, best_nm) = (i, d);
        }
    }
    best
}

/// The procedure's line from `a` on to `b`, each end where it is: the way
/// the lesson's airplane flies from one fix to the next. Straight between
/// them where the line has no point near either.
pub fn path_between(path: &[(f64, f64)], a: (f64, f64), b: (f64, f64)) -> Vec<(f64, f64)> {
    if path.len() < 2 {
        return vec![a, b];
    }
    let i = nearest_from(path, a, 0);
    let j = nearest_from(path, b, i);
    let mut out = vec![a];
    if i + 1 < j {
        out.extend_from_slice(&path[i + 1..j]);
    }
    out.push(b);
    out
}

/// How far along `path` its point nearest `at` is, nm.
pub fn along_nm(path: &[(f64, f64)], at: (f64, f64)) -> f64 {
    let i = nearest_from(path, at, 0);
    (1..=i).map(|k| nm(path[k - 1], path[k])).sum::<f64>()
}

mod missed;
pub use missed::*;
mod brief;
pub use brief::*;
mod coach;
pub use coach::*;
mod quiz;
pub use quiz::*;
