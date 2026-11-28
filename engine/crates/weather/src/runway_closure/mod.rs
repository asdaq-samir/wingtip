//! Where a closed runway's crosses go on a sketch of the field
//! (`runway_closure_marks`): the airport card's runway sketch marks a
//! closed runway as the airport marks it on the ground, so the picture
//! reads as the field does from the air.
//!
//! AC 150/5340-1M (Standards for Airport Markings, Change 1, 12/23/2020)
//! and AIM 2-3-6:
//!
//! - Permanently closed (AC 5.6; AIM 2-3-6d): "solid yellow 'X' markings
//!   are painted ... at each end of the runway and at 1,000-foot (305-m)
//!   intervals", and "For a closed runway that intersects an active
//!   runway, a solid yellow 'X' marking should be placed on the closed
//!   runway near the sides of the open intersecting runway. In most cases,
//!   two 'X' markings are required". NASR's runway remarks ("RWY 18/36
//!   CLSD INDEFLY", "PERMLY") are taken as this.
//! - Temporarily closed (AC 5.7.1; AIM 2-3-6e, "crosses are placed on the
//!   runway only at each end of the runway"): a NOTAM's closure. The AC's
//!   option 2 puts the X "over the runway designation markings", which
//!   Figure A-3 (a visual runway) starts 20 ft from the threshold, 60 ft
//!   tall: its middle 50 ft in. Figures A-1 and A-2 (instrument runways)
//!   set it 240 ft in, behind the threshold stripes; the card's data does
//!   not say which marking a runway has, so 50 ft, the nearer, and at a
//!   sketch's scale the X is set in its own size at least, so it lies
//!   wholly on the strip.
//!
//! A part closed by NOTAM (a length from one end) is marked as a closed
//! runway is, at each end of the part. The AC and the AIM mark a whole
//! runway; marking the part's ends is this sketch's reading of them.
//!
//! An X never lies on an open runway: one that would is moved along the
//! centre line until clear of it, the way the AC keeps its Xs "near the
//! sides of the open intersecting runway". The X's size is the drawing's
//! (`mark_ft`), so the clearance is the drawing's too.
//!
//! The FAA's Xs are yellow ("Both symbols are always painted yellow",
//! Figure A-27); the colour is the app's to choose.

mod part;
pub mod sketch;
#[cfg(test)]
mod tests;

use crate::json::{self, Value};
pub use part::{closes, Closes, Runway};
use wingtip_core::ask::Ask;
use wingtip_core::sort::StableSort;

/// How far apart a permanently closed runway's Xs are, feet (AC
/// 150/5340-1M 5.6; AIM 2-3-6d).
pub const INTERVAL_FT: f64 = 1000.0;

/// How far in from a threshold an end's X is centred, feet: over the
/// runway designation marking (AC 5.7.1.2), the middle of Figure A-3's
/// 60-ft numerals 20 ft from the threshold.
pub const SET_IN_FT: f64 = 50.0;

/// A runway as the sketch draws it: its ends in feet east and north of a
/// point, its drawn width in the same feet, and what closes it.
pub struct Strip {
    /// Its ends' designations as the card writes them ("02", "20").
    pub ends: [String; 2],
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub width_ft: f64,
    pub permanent: bool,
    pub notams: Vec<String>,
}

/// One runway's answer: the parts closed and where the Xs go, each in
/// feet from its first end.
#[derive(Debug, Default, PartialEq)]
pub struct Marked {
    pub closed: Vec<(f64, f64)>,
    pub marks: Vec<f64>,
}

fn length(s: &Strip) -> f64 {
    (s.b[0] - s.a[0]).hypot(s.b[1] - s.a[1])
}

/// The parts of `s` closed, feet from its first end, and whether all of it.
fn closed_parts(s: &Strip) -> (Vec<(f64, f64)>, bool) {
    let length = length(s);
    if s.permanent {
        return (vec![(0.0, length)], true);
    }
    let mid = [(s.a[0] + s.b[0]) / 2.0, (s.a[1] + s.b[1]) / 2.0];
    let bearing = (s.a[0] - mid[0]).atan2(s.a[1] - mid[1]).to_degrees().rem_euclid(360.0);
    let runway = Runway { ends: [&s.ends[0], &s.ends[1]], length_ft: length, first_end_bearing: bearing };
    let mut parts: Vec<(f64, f64)> = Vec::new();
    for text in &s.notams {
        match closes(text, &runway) {
            Closes::Whole => return (vec![(0.0, length)], true),
            Closes::Part(lo, hi) => parts.push((lo, hi)),
            Closes::Nothing => {}
        }
    }
    parts.stable_sort_by(|p, q| p.0.total_cmp(&q.0));
    let mut merged: Vec<(f64, f64)> = Vec::new();
    for (lo, hi) in parts {
        match merged.last_mut() {
            Some(last) if lo <= last.1 => last.1 = last.1.max(hi),
            _ => merged.push((lo, hi)),
        }
    }
    let whole = merged.first().is_some_and(|&(lo, hi)| lo <= 0.0 && hi >= length);
    (merged, whole)
}

/// Where along `s` (feet from its first end) an X of half size `m` would
/// lie on `open`, as an interval of its centre; None where they do not meet.
fn crossing(s: &Strip, open: &Strip, m: f64) -> Option<(f64, f64)> {
    let (l1, l2) = (length(s), length(open));
    if l1 <= 0.0 || l2 <= 0.0 {
        return None;
    }
    let u = [(s.b[0] - s.a[0]) / l1, (s.b[1] - s.a[1]) / l1];
    let v = [(open.b[0] - open.a[0]) / l2, (open.b[1] - open.a[1]) / l2];
    let cross = u[0] * v[1] - u[1] * v[0];
    let sin = cross.abs();
    // Parallel runways (within 5 degrees) do not cross.
    if sin < 5f64.to_radians().sin() {
        return None;
    }
    let cos = (u[0] * v[0] + u[1] * v[1]).abs();
    let d = [open.a[0] - s.a[0], open.a[1] - s.a[1]];
    let along = (d[0] * v[1] - d[1] * v[0]) / cross;
    let on_open = (d[0] * u[1] - d[1] * u[0]) / cross;
    // How far along the closed runway its X's corners stay on the open
    // strip: the open strip's half width and the X's reach across it.
    let clear = (open.width_ft / 2.0 + m * (sin + cos)) / sin;
    // The open strip's ends reach the closed one's X a little past them.
    let reach = (s.width_ft / 2.0 + m * (sin + cos)) / sin;
    if on_open < -reach || on_open > l2 + reach || along < -clear || along > l1 + clear {
        return None;
    }
    Some((along - clear, along + clear))
}

/// `at`, moved along the runway out of every interval in `kept_off`,
/// toward `hi` first where `toward_hi` (an end's X goes on into its
/// runway), else toward `lo`, the other way where the first takes it out
/// of `lo`..`hi`; None where both do.
fn clear_of(at: f64, toward_hi: bool, kept_off: &[(f64, f64)], lo: f64, hi: f64) -> Option<f64> {
    let moved = |up: bool| {
        let mut at = at;
        while let Some(&(from, to)) = kept_off.iter().find(|(from, to)| at > *from && at < *to) {
            at = if up { to } else { from };
        }
        (lo..=hi).contains(&at).then_some(at)
    };
    moved(toward_hi).or_else(|| moved(!toward_hi))
}

/// The crosses on every runway of the field.
pub fn marks(strips: &[Strip], mark_ft: f64) -> Vec<Marked> {
    let m = mark_ft.max(0.0);
    let parts: Vec<(Vec<(f64, f64)>, bool)> = strips.iter().map(closed_parts).collect();
    strips
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let (closed, _) = &parts[i];
            if closed.is_empty() {
                return Marked::default();
            }
            let length = length(s);
            // Every runway not closed end to end is open where it crosses.
            let kept_off: Vec<(f64, f64)> =
                strips.iter().enumerate().filter(|&(j, _)| j != i && !parts[j].1).filter_map(|(_, o)| crossing(s, o, m)).collect();
            let gap = 2.0 * m;
            let mut placed: Vec<f64> = Vec::new();
            let add = |at: f64, placed: &mut Vec<f64>| {
                if placed.iter().all(|p| (p - at).abs() >= gap) {
                    placed.push(at);
                }
            };
            for &(lo, hi) in closed {
                let inset = |edge: f64| if edge <= 0.0 || edge >= length { SET_IN_FT.max(m) } else { m };
                let (first, last) = (lo + inset(lo), hi - inset(hi));
                let (first, last) = if first > last { ((lo + hi) / 2.0, (lo + hi) / 2.0) } else { (first, last) };
                let first = clear_of(first, true, &kept_off, lo + m, hi - m);
                let last = clear_of(last, false, &kept_off, lo + m, hi - m);
                first.into_iter().chain(last).for_each(|at| add(at, &mut placed));
                if s.permanent {
                    // Either side of each open runway it crosses (5.6).
                    for &(from, to) in &kept_off {
                        [from, to].into_iter().filter(|at| (lo + m..=hi - m).contains(at)).for_each(|at| add(at, &mut placed));
                    }
                    // Every 1,000 ft from the first end's X, clear of the open ones.
                    if let Some(start) = first {
                        let mut at = start + INTERVAL_FT;
                        while at < hi - m {
                            if !kept_off.iter().any(|(from, to)| at > *from && at < *to) {
                                add(at, &mut placed);
                            }
                            at += INTERVAL_FT;
                        }
                    }
                }
            }
            placed.stable_sort_by(f64::total_cmp);
            Marked { closed: closed.clone(), marks: placed }
        })
        .collect()
}

fn pair(v: Option<&Value>) -> Option<[f64; 2]> {
    let p = v?.as_array()?;
    Some([p.first()?.as_f64()?, p.get(1)?.as_f64()?])
}

/// `runway_closure_marks`: `{"runways": [{"ends", "a", "b", "width_ft",
/// "permanent"?, "notams"?}], "mark_ft"}` to `{"runways": [{"closed",
/// "marks"}]}`, each a fraction of the way from its first end.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mark_ft = ask.num("mark_ft")?;
    let mut strips = Vec::new();
    for r in ask.list("runways")? {
        let ends: Vec<&str> =
            r.get("ends").and_then(Value::as_array).map(|e| e.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        let (Some(a), Some(b), [_, _]) = (pair(r.get("a")), pair(r.get("b")), ends.as_slice()) else {
            return Err(format!("{name}: a runway needs \"ends\", \"a\" and \"b\""));
        };
        let notams = r
            .get("notams")
            .and_then(Value::as_array)
            .map(|n| n.iter().filter_map(Value::as_str).map(str::to_owned).collect())
            .unwrap_or_default();
        strips.push(Strip {
            ends: [ends[0].to_owned(), ends[1].to_owned()],
            a,
            b,
            width_ft: r.get("width_ft").and_then(Value::as_f64).unwrap_or(0.0),
            permanent: matches!(r.get("permanent"), Some(Value::Bool(true))),
            notams,
        });
    }
    let answer = marks(&strips, mark_ft);
    let mut out = String::from("{\"runways\":[");
    for (k, (marked, s)) in answer.iter().zip(&strips).enumerate() {
        let length = length(s).max(f64::MIN_POSITIVE);
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"closed\":[");
        for (j, (lo, hi)) in marked.closed.iter().enumerate() {
            out.push_str(if j > 0 { ",[" } else { "[" });
            json::number(&mut out, round(lo / length));
            out.push(',');
            json::number(&mut out, round(hi / length));
            out.push(']');
        }
        out.push_str("],\"marks\":[");
        for (j, at) in marked.marks.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            json::number(&mut out, round(at / length));
        }
        out.push_str("]}");
    }
    out.push_str("]}");
    Ok(out)
}

/// A fraction to four places, so an answer reads the same on every host.
fn round(f: f64) -> f64 {
    (f * 1e4).round() / 1e4
}
