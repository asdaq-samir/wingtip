//! What of a runway one NOTAM closes, read from its words (FAA Order JO
//! 7930.2): the whole of it, a part measured from one end, or nothing the
//! sketch can draw. Read as notam_subject reads the same NOTAM, so the
//! sketch never draws closed what the card's badge does not call closed.

use crate::contractions::point_bearing;
use crate::notam_subject::parts::{designations, ends_of, runway_has};
use crate::notam_subject::{closure, subject_of, Severity};

/// What a NOTAM closes of one runway.
#[derive(Debug, PartialEq)]
pub enum Closes {
    /// All of it, to landing and takeoff ("RWY 02/20 CLSD", "CLSD EXC XNG",
    /// and "CLSD BTN TWY A AND RWY END 20", whose taxiway the engine has no
    /// place for, so the whole runway is drawn closed as the badge says).
    Whole,
    /// Feet from its first end (`a`) to feet from it, `lo` < `hi`.
    Part(f64, f64),
    /// Not this runway, not a closure, or a part it cannot place.
    Nothing,
}

/// The runway as the sketch has it: its ends' designations as the card
/// writes them ("02", "20") and the bearing, degrees true, from its middle
/// to its first end.
pub struct Runway<'a> {
    pub ends: [&'a str; 2],
    pub length_ft: f64,
    pub first_end_bearing: f64,
}

/// A length in feet as JO 7930.2 writes one ("500FT", "1000FT").
fn feet(word: &str) -> Option<f64> {
    word.strip_suffix("FT").filter(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))?.parse().ok()
}

/// The angle between two bearings, 0 to 180.
fn apart(a: f64, b: f64) -> f64 {
    let d = (a - b).rem_euclid(360.0);
    d.min(360.0 - d)
}

/// What `text` closes of `runway`. A part is read from the forms JO
/// 7930.2 gives a part of a runway closed: a compass side and a length
/// ("RWY 09/27 E 500FT CLSD", the side's end measured from, so the east
/// 500 ft is the 27 end's) or one end's FIRST or LAST length ("RWY 20
/// FIRST 1000FT CLSD"). The side is taken by the runway's own drawn line:
/// the end within 67.5 degrees of the side named (three points of the
/// compass), else the part is not placed -- "E 500FT" on runway 18/36
/// names no end.
pub fn closes(text: &str, runway: &Runway) -> Closes {
    let Some((keyword, body, _)) = subject_of(text) else { return Closes::Nothing };
    if keyword != "RWY" {
        return Closes::Nothing;
    }
    let (named, used) = designations(&body);
    if !runway_has(&runway.ends.join("/"), &named) {
        return Closes::Nothing;
    }
    let rest = &body[used..];
    let Some(at) = rest.iter().position(|w| w == "CLSD") else { return Closes::Nothing };
    if at == 0 {
        // Closed, as notam_subject's badge says it: to landing and takeoff
        // (unusable). Closed at times or to some aircraft is not drawn.
        return if closure(&rest[1..]).1 == Severity::Unusable { Closes::Whole } else { Closes::Nothing };
    }
    let before = &rest[..at];
    let Some(length) = before.iter().find_map(|w| feet(w)) else { return Closes::Nothing };
    let length = length.min(runway.length_ft);
    let own: Vec<String> = runway.ends.iter().filter_map(|e| ends_of(e)).flatten().collect();
    // Which end the part is measured from: 0 the first, 1 the second.
    let from = if let Some(side) = before.iter().find_map(|w| point_bearing(w)) {
        let to_first = apart(side, runway.first_end_bearing);
        if to_first < 67.5 {
            Some(0)
        } else if to_first > 112.5 {
            Some(1)
        } else {
            None
        }
    } else if named.len() == 1 && own.len() == 2 {
        let named_end = own.iter().position(|e| *e == named[0]);
        match (before.iter().any(|w| w == "FIRST"), before.iter().any(|w| w == "LAST"), named_end) {
            (true, false, Some(i)) => Some(i),
            (false, true, Some(i)) => Some(1 - i),
            _ => None,
        }
    } else {
        None
    };
    match from {
        Some(0) => Closes::Part(0.0, length),
        Some(_) => Closes::Part(runway.length_ft - length, runway.length_ft),
        None => Closes::Nothing,
    }
}
