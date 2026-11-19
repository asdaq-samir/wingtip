//! A flight debriefed from its flown track (the roadmap's debrief, against
//! ACS PA.VI.A's tolerances): the saved flight's nav log is the plan, the
//! track what was flown. Leg by leg, how much of the cruise was within 200
//! ft of the planned altitude and how much of the way the ground track was
//! within 15 degrees of the course, and how far off the line it went
//! (within 3 nm, S5); at each checkpoint, when it was passed against when
//! it was due (within 5 minutes, S6) and how close; at each field landed
//! at, the altitude about where the downwind starts against the pattern's.
//!
//! Deterministic: measured, not judged. GPS altitude is not the
//! altimeter's and a ground track is not a heading, so each figure is
//! close to what the examiner sees, not it -- the page says so.
//!
//! app.figures.debrief (itself apps/web/src/lib/debrief.ts): the web's copy
//! holds the same rules and changes with this. Its checkpoints are the
//! saved flight's (the gateway's FlightCheckpointDto) and its points the
//! track's (TrackDto: `t` in ms since 1970, GPS altitude in feet).

use crate::geo::{angle_between, bearing_deg, distance_nm, Flat};
use crate::{json, sort::StableSort};

/// PA.VI.A's tolerances: S7's altitude, and its heading applied to the
/// ground track; S5's distance from the planned route; S6's time at each
/// checkpoint against its estimate.
pub const ALTITUDE_FT: f64 = 200.0;
pub const COURSE_DEG: f64 = 15.0;
pub const OFF_ROUTE_NM: f64 = 3.0;
pub const ETA_MIN: f64 = 5.0;
/// How near the field the downwind is taken to start, and PA.III.B.S5's
/// pattern altitude.
pub const PATTERN_NM: f64 = 1.5;
pub const PATTERN_FT: f64 = 100.0;
/// Slower than this over the ground, the airplane is on the ground (the
/// web's lib/map/glide AIRBORNE_KT): a fast taxi is under it, a light
/// single's slowest flight over it.
pub const AIRBORNE_KT: f64 = 40.0;

/// A point of the flown track: `t` ms since 1970, GPS altitude in feet
/// where the file has one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
}

/// A saved flight's checkpoint: its place and the plan's figures into it.
#[derive(Clone, Debug, PartialEq)]
pub struct Checkpoint {
    pub sequence_no: i64,
    pub name: String,
    /// "departure", "stop", "destination", or a checkpoint's own kind.
    pub category: String,
    pub lat: f64,
    pub lon: f64,
    pub along_track_nm: f64,
    pub true_course_deg: Option<f64>,
    pub ete_min: Option<f64>,
    pub altitude_ft: Option<f64>,
}

/// A leg graded.
#[derive(Clone, Debug, PartialEq)]
pub struct LegGrade {
    pub from: String,
    pub to: String,
    pub planned_alt_ft: Option<f64>,
    pub altitude_within: Option<f64>,
    pub worst_alt_ft: Option<f64>,
    pub course_deg: Option<f64>,
    pub course_within: Option<f64>,
    pub worst_off_nm: Option<f64>,
}

/// A checkpoint passed: minutes from the takeoff it was due and passed.
#[derive(Clone, Debug, PartialEq)]
pub struct Pass {
    pub name: String,
    pub category: String,
    pub due_min: Option<f64>,
    pub passed_min: Option<f64>,
    pub closest_nm: Option<f64>,
}

/// The altitude PATTERN_NM from a field landed at, and its pattern's.
#[derive(Clone, Debug, PartialEq)]
pub struct PatternEntry {
    pub ident: String,
    pub alt_ft: f64,
    pub pattern_ft: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinePoint {
    pub lat: f64,
    pub lon: f64,
    pub off: bool,
}

/// The flight debriefed (unmarked: `marks` and `debrief_json` add each
/// finding's mark).
#[derive(Clone, Debug, PartialEq)]
pub struct Debrief {
    pub takeoff: f64,
    pub landing: f64,
    pub flown_min: f64,
    pub planned_min: Option<f64>,
    pub legs: Vec<LegGrade>,
    pub passes: Vec<Pass>,
    pub patterns: Vec<PatternEntry>,
    /// Along the route, nm, and the altitude there.
    pub profile: Vec<(f64, f64)>,
    /// Each leg's from and to, nm along, and its planned altitude.
    pub planned: Vec<(f64, f64, Option<f64>)>,
    pub line: Vec<LinePoint>,
    pub has_altitude: bool,
    pub notes: Vec<String>,
}

fn nm(a: (f64, f64), b: (f64, f64)) -> f64 {
    distance_nm(a.0, a.1, b.0, b.1)
}

fn at(p: &Point) -> (f64, f64) {
    (p.lat, p.lon)
}

fn place(c: &Checkpoint) -> (f64, f64) {
    (c.lat, c.lon)
}

/// Ground speed at each point, knots: over at least ten seconds round it,
/// which a one-second GPS's jitter would otherwise make a mess of.
/// The logbook drawn from a track (pilot::autolog) reads them too.
pub fn ground_speeds(points: &[Point]) -> Vec<f64> {
    let last = points.len().saturating_sub(1);
    (0..points.len())
        .map(|i| {
            let (mut j, mut k) = (i, i);
            while points[k].t - points[j].t < 10_000.0 && (j > 0 || k < last) {
                j = j.saturating_sub(1);
                if k < last {
                    k += 1;
                }
            }
            let hours = (points[k].t - points[j].t) / 3_600_000.0;
            if hours > 0.0 {
                nm(at(&points[j]), at(&points[k])) / hours
            } else {
                0.0
            }
        })
        .collect()
}

/// The track's flights: each run of points over AIRBORNE_KT, as (first,
/// last) indices, a minute's dip under it (a slow flight, a go-around)
/// kept in, and a run of under a minute (a fast taxi) dropped.
pub fn airborne(points: &[Point]) -> Vec<(usize, usize)> {
    let mut runs: Vec<(usize, usize)> = Vec::new();
    for (i, kt) in ground_speeds(points).into_iter().enumerate() {
        if kt < AIRBORNE_KT {
            continue;
        }
        match runs.last_mut() {
            Some(run) if points[i].t - points[run.1].t < 60_000.0 => run.1 = i,
            _ => runs.push((i, i)),
        }
    }
    runs.retain(|r| points[r.1].t - points[r.0].t >= 60_000.0);
    runs
}

/// Where a point is against a segment: how far along it (0 to 1), how far
/// right of it (left negative), and how far from it at all. Flat over a
/// leg, which is near enough at a leg's length.
fn against(from: &Checkpoint, to: &Checkpoint, p: &Point) -> (f64, f64, f64) {
    let flat = Flat::about(from.lat, from.lon);
    let (bx, by) = flat.nm(to.lat, to.lon);
    let (px, py) = flat.nm(p.lat, p.lon);
    let len2 = bx * bx + by * by;
    let t = if len2 > 0.0 { (px * bx + py * by) / len2 } else { 0.0 };
    let right = if len2 > 0.0 { -(bx * py - by * px) / len2.sqrt() } else { px.hypot(py) };
    let away = if t < 0.0 {
        px.hypot(py)
    } else if t > 1.0 {
        (px - bx).hypot(py - by)
    } else {
        right.abs()
    };
    (t.clamp(0.0, 1.0), right, away)
}

/// The flight's hops, by checkpoint index: from each field taken off from
/// to the next landed at.
fn hops(cps: &[Checkpoint]) -> Vec<(usize, usize)> {
    let fields: Vec<usize> = (0..cps.len()).filter(|&i| i == 0 || i == cps.len() - 1 || cps[i].category == "stop").collect();
    fields.windows(2).map(|w| (w[0], w[1])).collect()
}

#[derive(Default, Clone, Copy)]
struct Grade {
    alt_w: f64,
    alt_in: f64,
    worst_alt: Option<f64>,
    course_w: f64,
    course_in: f64,
    worst_off: Option<f64>,
}

mod run;
pub use run::*;
mod render;
pub use render::*;
