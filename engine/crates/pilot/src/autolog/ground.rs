//! Where a flown track met the ground: its takeoffs, its landings (to a
//! full stop, or a touch-and-go) and the field of each, and the flight
//! time round them (14 CFR 1.1).
//!
//! The track is a phone's GPS: positions every second or few, an altitude
//! above sea level that is good to some tens of feet, and nothing of the
//! engine or the wheels. So each figure is read from how the airplane
//! moved, and the rule errs toward logging less: a landing it cannot tell
//! from a low pass is not counted, and a full stop must be seen slowing to
//! a taxi.

use super::Field;
use wingtip_core::geo::distance_nm;
use wingtip_core::sort::StableSort;
use wingtip_procedures::figures::debrief::{airborne, ground_speeds, Point, AIRBORNE_KT};

/// Moving under its own power: faster than a walk over the ground. A
/// phone carried to the airplane walks at 2 to 3.5 kt, and its GPS
/// wanders a knot or two at rest; a taxi is 5 kt and more.
pub const MOVING_KT: f64 = 5.0;
/// "Comes to rest after landing" (1.1's flight time): slower than
/// MOVING_KT for a minute. A stop shorter than that (a hold-short, a
/// pause on the taxiway) is still the flight.
pub const REST_MS: f64 = 60_000.0;
/// Before the first takeoff, a stop this long ends what came before: the
/// walk out, the preflight with the phone on the seat. Shorter ones (the
/// run-up, waiting to be cleared) are flight time, as the airplane moved
/// under its own power "for the purpose of flight" (1.1).
pub const PRESTART_REST_MS: f64 = 10.0 * 60_000.0;
/// To a full stop (61.57(b)): slowed to a taxi or slower after landing.
/// The FAA's rule does not say how slow; a taxi's 20 kt is the reading
/// the app takes, and a landing that never slowed so far is logged as a
/// touch-and-go, which counts for 61.57(a) and not for (b).
pub const FULL_STOP_KT: f64 = 20.0;
/// A touch-and-go read off the altitude: the GPS altitude this close to
/// the field's elevation (NASR's, ft MSL) inside a flight, with higher on
/// both sides. A phone's GPS altitude is good to some tens of feet, so a
/// pass lower than this is taken for a touch: the pilot is shown it and
/// changes it where it was a low approach.
pub const TOUCH_FT: f64 = 50.0;
/// A landing is at the field whose reference point is this near: the
/// longest runways put their ends some 2 nm from the field's point.
pub const FIELD_NM: f64 = 2.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    FullStop,
    TouchAndGo,
}

impl Kind {
    pub fn key(self) -> &'static str {
        match self {
            Kind::FullStop => "full_stop",
            Kind::TouchAndGo => "touch_and_go",
        }
    }
}

/// A landing: the point it was made at, how, and the field (an index of
/// the fields given) or None off any.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Landing {
    pub i: usize,
    pub kind: Kind,
    pub field: Option<usize>,
}

/// A takeoff: the point the roll passed AIRBORNE_KT, and its field.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Takeoff {
    pub i: usize,
    pub field: Option<usize>,
}

/// The track read on the ground: each flight (airborne's runs), its
/// takeoffs and landings, and the flight time's spans as point indices.
#[derive(Clone, Debug, PartialEq)]
pub struct Ground {
    pub gs: Vec<f64>,
    pub runs: Vec<(usize, usize)>,
    pub takeoffs: Vec<Takeoff>,
    pub landings: Vec<Landing>,
    pub spans: Vec<(usize, usize)>,
    /// The track ends in the air: the last flight has no landing.
    pub ends_airborne: bool,
}

/// The field nearest a point within FIELD_NM.
pub fn field_at(fields: &[Field], lat: f64, lon: f64) -> Option<usize> {
    fields
        .iter()
        .enumerate()
        .map(|(k, f)| (k, distance_nm(lat, lon, f.lat, f.lon)))
        .filter(|(_, nm)| *nm <= FIELD_NM)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(k, _)| k)
}

/// The touch-and-goes inside one flight: runs of points on the field
/// (by altitude, or by a slowing under AIRBORNE_KT that airborne bridged)
/// with the airplane higher, or faster, on both sides. The middle point
/// of each.
fn touches(points: &[Point], gs: &[f64], fields: &[Field], run: (usize, usize)) -> Vec<(usize, usize)> {
    let on_field = |i: usize| -> Option<usize> {
        let p = &points[i];
        let f = field_at(fields, p.lat, p.lon)?;
        let low = match (p.alt_ft, fields[f].elevation_ft) {
            (Some(alt), Some(elev)) => alt <= elev + TOUCH_FT,
            _ => false,
        };
        (low || gs[i] < AIRBORNE_KT).then_some(f)
    };
    let above = |i: usize| -> bool {
        let p = &points[i];
        match (p.alt_ft, field_at(fields, p.lat, p.lon).and_then(|f| fields[f].elevation_ft)) {
            (Some(alt), Some(elev)) => alt > elev + TOUCH_FT,
            // No altitude, or no field here: flying where it is fast.
            _ => gs[i] >= AIRBORNE_KT,
        }
    };
    let mut found = Vec::new();
    let mut i = run.0;
    while i <= run.1 {
        let Some(f) = on_field(i) else {
            i += 1;
            continue;
        };
        let mut j = i;
        while j < run.1 && on_field(j + 1) == Some(f) {
            j += 1;
        }
        // Interior only: the takeoff roll opens a flight and the landing
        // roll closes it, with nothing higher before or after.
        let before = (run.0..i).any(above);
        let after = (j + 1..=run.1).any(above);
        if before && after {
            found.push(((i + j) / 2, f));
        }
        i = j + 1;
    }
    found
}

/// The first point from `from` on where the airplane comes to rest
/// (slower than MOVING_KT for REST_MS), None where it never does.
fn rest_after(points: &[Point], gs: &[f64], from: usize, to: usize) -> Option<usize> {
    let mut i = from;
    while i <= to {
        if gs[i] < MOVING_KT {
            let mut j = i;
            while j < to && gs[j + 1] < MOVING_KT {
                j += 1;
            }
            if points[j].t - points[i].t >= REST_MS {
                return Some(i);
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    None
}

/// Where the flight time leading to the takeoff at `takeoff` began: back
/// over the taxi and short stops to the first point moving, not past a
/// stop of PRESTART_REST_MS (nor past `floor`).
fn moved_from(points: &[Point], gs: &[f64], floor: usize, takeoff: usize) -> usize {
    let mut start = takeoff;
    let mut still_since: Option<usize> = None;
    let mut i = takeoff;
    while i > floor {
        i -= 1;
        if gs[i] >= MOVING_KT {
            start = i;
            still_since = None;
        } else {
            let s = *still_since.get_or_insert(i);
            if points[s].t - points[i].t >= PRESTART_REST_MS {
                break;
            }
        }
    }
    start
}

/// The track read on the ground. `points` in time order.
pub fn read(points: &[Point], fields: &[Field]) -> Ground {
    let gs = ground_speeds(points);
    let runs = airborne(points);
    let last = points.len().saturating_sub(1);
    let mut takeoffs = Vec::new();
    let mut landings = Vec::new();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut ends_airborne = false;
    let mut floor = 0;
    for (k, &run) in runs.iter().enumerate() {
        let next_start = runs.get(k + 1).map_or(last, |r| r.0);
        let at = |i: usize| field_at(fields, points[i].lat, points[i].lon);
        takeoffs.push(Takeoff { i: run.0, field: at(run.0) });
        for (i, f) in touches(points, &gs, fields, run) {
            landings.push(Landing { i, kind: Kind::TouchAndGo, field: Some(f) });
            takeoffs.push(Takeoff { i, field: Some(f) });
        }
        // The flight's end: in the air where the track stops fast;
        // to a full stop where it slowed to a taxi before flying again.
        let slowed = (run.1..=next_start).any(|i| gs[i] <= FULL_STOP_KT);
        if run.1 == last && gs[last] >= AIRBORNE_KT {
            ends_airborne = true;
        } else {
            landings.push(Landing { i: run.1, kind: if slowed { Kind::FullStop } else { Kind::TouchAndGo }, field: at(run.1) });
        }
        // Flight time: from moving off (or on from the last span, where it
        // never came to rest) to coming to rest after this landing.
        let start = moved_from(points, &gs, floor, run.0);
        let end = rest_after(points, &gs, run.1, next_start).unwrap_or(next_start.max(run.1));
        match spans.last_mut() {
            Some(span) if start <= span.1 => span.1 = end,
            _ => spans.push((start, end)),
        }
        floor = end;
    }
    takeoffs.stable_sort_by_key(|t| t.i);
    landings.stable_sort_by_key(|l| l.i);
    Ground { gs, runs, takeoffs, landings, spans, ends_airborne }
}
