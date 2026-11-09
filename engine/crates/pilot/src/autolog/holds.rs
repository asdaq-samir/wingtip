//! Holds read off a flown track, for 61.57(c)(1)(ii)'s "holding
//! procedures and tasks": a racetrack, two turns of about 180 degrees the
//! same way with a straight leg between (AIM 5-3-8: the standard pattern
//! turns right, its inbound leg one minute at or below 14,000 ft MSL),
//! flown within a few miles, clear of the fields' traffic patterns.
//!
//! What it tells apart, and how: a traffic pattern also turns one way with
//! straight legs, so a racetrack within FIELD_CLEAR_NM of a field is not
//! taken for a hold; an orbit (a 360 turned on the spot) has no straight
//! leg, and a procedure turn turns both ways. A hold the track flew near
//! a field is so missed, toward logging less.

use super::Field;
use wingtip_core::geo::{bearing_deg, distance_nm};
use wingtip_procedures::figures::debrief::Point;

/// Turning: a heading changing faster than this, degrees a second. A
/// standard-rate turn is 3 (AIM 5-3-8's turns, the instrument flying
/// handbook's), a half-standard one 1.5.
pub const TURNING_DEG_S: f64 = 1.0;
/// A hold's turn: 180 degrees, flown as 140 to 250 with a wind's
/// correction and an entry's.
pub const TURN_MIN_DEG: f64 = 140.0;
pub const TURN_MAX_DEG: f64 = 250.0;
/// The straight leg between its turns: a minute (AIM 5-3-8), less in a
/// wind; at least half of one.
pub const LEG_MIN_MS: f64 = 30_000.0;
/// The racetrack's span: a one-minute leg at 140 kt and two turns' width
/// fit in 4 nm; a DME hold's longer legs in 6.
pub const SPAN_NM: f64 = 6.0;
/// Clear of the fields: a traffic pattern's legs lie within 2 to 3 nm of
/// its field (AC 90-66C's pattern, flown at 1 nm or so off the runway).
pub const FIELD_CLEAR_NM: f64 = 3.0;
/// A hold fix of the procedures given this near names the hold.
pub const FIX_NM: f64 = 3.0;

/// A hold flown: its first and last points, its hold turns (two to a
/// racetrack), and the hold
/// fix of the procedures given nearest it, by name.
#[derive(Clone, Debug, PartialEq)]
pub struct Hold {
    pub from: usize,
    pub to: usize,
    pub turns: usize,
    pub lat: f64,
    pub lon: f64,
    pub fix: Option<String>,
}

/// A turn: from and to (point indices), and how far, signed (right +).
#[derive(Clone, Copy, Debug)]
struct Turn {
    from: usize,
    to: usize,
    deg: f64,
}

/// The heading change between two bearings, -180 to 180.
fn change(a: f64, b: f64) -> f64 {
    (b - a + 540.0).rem_euclid(360.0) - 180.0
}

/// The turns of a flight: runs of turning faster than TURNING_DEG_S, gaps
/// of under ten seconds bridged.
fn turns(points: &[Point], run: (usize, usize)) -> Vec<Turn> {
    let heading = |i: usize| -> Option<f64> {
        let (a, b) = (&points[i], &points[i + 1]);
        (distance_nm(a.lat, a.lon, b.lat, b.lon) > 0.005).then(|| bearing_deg(a.lat, a.lon, b.lat, b.lon))
    };
    let mut out: Vec<Turn> = Vec::new();
    let mut last: Option<(usize, f64)> = None;
    for i in run.0..run.1 {
        let Some(h) = heading(i) else { continue };
        if let Some((j, before)) = last {
            let dt = (points[i].t - points[j].t) / 1000.0;
            let d = change(before, h);
            if dt > 0.0 && (d / dt).abs() >= TURNING_DEG_S {
                match out.last_mut() {
                    Some(t) if (points[j].t - points[t.to].t) < 10_000.0 && t.deg.signum() == d.signum() => {
                        t.to = i;
                        t.deg += d;
                    }
                    _ => out.push(Turn { from: j, to: i, deg: d }),
                }
            }
        }
        last = Some((i, h));
    }
    out
}

/// The holds a flight flew: each pair of turns a racetrack makes, joined
/// while they follow on.
pub fn holds(points: &[Point], runs: &[(usize, usize)], fields: &[Field], hold_fixes: &[(String, f64, f64)]) -> Vec<Hold> {
    let mut found: Vec<Hold> = Vec::new();
    for &run in runs {
        let ts = turns(points, run);
        for w in ts.windows(2) {
            let (a, b) = (w[0], w[1]);
            let sized = |t: Turn| (TURN_MIN_DEG..=TURN_MAX_DEG).contains(&t.deg.abs());
            if !sized(a) || !sized(b) || a.deg.signum() != b.deg.signum() || points[b.from].t - points[a.to].t < LEG_MIN_MS {
                continue;
            }
            let span = (a.from..=b.to).all(|i| distance_nm(points[a.from].lat, points[a.from].lon, points[i].lat, points[i].lon) <= SPAN_NM);
            let clear = (a.from..=b.to).all(|i| fields.iter().all(|f| distance_nm(f.lat, f.lon, points[i].lat, points[i].lon) > FIELD_CLEAR_NM));
            if !span || !clear {
                continue;
            }
            match found.last_mut() {
                // The next racetrack of the same hold.
                Some(h) if a.from <= h.to + 1 || distance_nm(h.lat, h.lon, points[a.from].lat, points[a.from].lon) <= SPAN_NM && points[a.from].t - points[h.to].t < 120_000.0 => {
                    h.to = h.to.max(b.to);
                    h.turns += 1;
                }
                _ => {
                    let n = (b.to - a.from + 1) as f64;
                    let lat = (a.from..=b.to).map(|i| points[i].lat).sum::<f64>() / n;
                    let lon = (a.from..=b.to).map(|i| points[i].lon).sum::<f64>() / n;
                    let fix = hold_fixes
                        .iter()
                        .map(|(name, flat, flon)| (name, distance_nm(lat, lon, *flat, *flon)))
                        .filter(|(_, nm)| *nm <= FIX_NM)
                        .min_by(|x, y| x.1.total_cmp(&y.1))
                        .map(|(name, _)| name.clone());
                    found.push(Hold { from: a.from, to: b.to, turns: 2, lat, lon, fix });
                }
            }
        }
    }
    found
}
