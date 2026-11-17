//! The flight as planned, flown on paper (the web's navlog/dryRun), at the
//! owner's ask ("a dry run of the flight with altitude and speed
//! profile"): from the nav log's rows, in order, each leg's piece flown in
//! its own time (its ETE, or its distance at its ground speed) on its true
//! course at its ground speed, burning its fuel; the height the plan's
//! profile's at each point (crate::motion::profile: the climbs, the level
//! legs and the 3:1 descents). Ends where a leg is not in yet.
//!
//! The airplane flies the course line the map draws (the planner's
//! course_line), at the owner's notice ("How come the plane seems of course
//! in dry run?"): put between the rows' points straight across the chart's
//! latitudes and longitudes, it ran 3.5 nm west of the line half way from
//! C81 to Duluth, the line being the great circle the legs are flown on.
//! With no line, on the great circle between the rows' points.
//!
//! A leg the planner flies by the procedures picked (its `procedure`: out
//! of a field by its departure, into one by its arrival and its approach,
//! each to its runway; planner with_procedures) is flown along
//! their path from its start, the whole leg at once -- its tops of climb
//! and descent, laid along the route, are passed as it starts -- in the
//! leg's own time and fuel, which the planner made the longer by the path's
//! miles more. Coming in, its heights are the plan's climb and the chart's
//! (landing_heights); going out alone, the plan's laid evenly over the
//! path. There is no approach speed in an airplane's figures, so the leg's
//! ground speed it is. Gone missed, the last approach goes missed at its
//! missed approach point instead of landing: its missed approach and once
//! round its hold, climbing at the standard gradient (missed_heights).
//!
//! The run's figures between its points, as it plays, stay in each app:
//! they are asked every frame.

use super::profile::{f, maybe, plan_profile, rows_of, Kind, ProfilePoint, Row, DESCENT_FT_PER_NM};
use super::{num, opt_bool};
use crate::figures::words::js_round;
use crate::geo::{bearing_deg, destination, distance_nm};
use crate::json::{self, Value};

/// Where the airplane is put along the route between the nav log's rows,
/// nm: often enough that its height follows the profile's climb and
/// descent, and its line the route's.
pub const STEP_NM: f64 = 2.0;
/// The climb a missed approach is built for, ft a nm, where its chart
/// publishes no steeper one: 200 (FAA Order 8260.3, the standard missed
/// approach climb gradient).
pub const MISSED_CLIMB_FT_PER_NM: f64 = 200.0;

type LatLon = (f64, f64);

/// JavaScript's Math.min and Math.max, which a NaN wins, where Rust's
/// f64::min and max pass it over.
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}

fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}

/// A report of the run: when (s since 1970), where, how high, how fast and
/// which way, as a replay's reports are (/api's PastFlightPoint).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RunPoint {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
    pub gs_kt: Option<f64>,
    pub track_deg: Option<f64>,
}

/// A landing, a stop's or the destination's: when the run is in, the
/// distance flown and the fuel burnt by then.
#[derive(Clone, Debug, PartialEq)]
pub struct Landing {
    pub ident: String,
    pub t: f64,
    pub nm: f64,
    pub fuel: f64,
}

/// The planned flight as a replay's reports, and what it has flown and
/// burnt by each.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DryRun {
    pub points: Vec<RunPoint>,
    /// Distance flown by each point, nm.
    pub along_nm: Vec<f64>,
    /// Fuel burnt by each point, gal.
    pub fuel_gal: Vec<f64>,
    /// When the airplane reaches each of the nav log's rows.
    pub row_t: Vec<f64>,
    /// The distance flown to each of those rows (`run`) and the route's
    /// there, the legs' own (`route`).
    pub bends: Vec<(f64, f64)>,
    /// Whether an approach picked into a field has a missed approach to fly.
    pub missable: bool,
    /// When the airplane is on that approach's final: from its final
    /// approach fix to its missed approach point.
    pub last_final: Option<(f64, f64)>,
    pub landings: Vec<Landing>,
}

/// A leg flown as procedures or round a hold: its path from the row
/// before, the distance along it to each of its points, and the heights it
/// is flown at along it, or None for the plan's own laid evenly over it.
#[derive(Clone, Debug)]
struct Flown {
    path: Vec<LatLon>,
    at: Vec<f64>,
    heights: Option<Vec<ProfilePoint>>,
}

#[derive(Clone, Debug)]
struct Anchor {
    along: f64,
    route: f64,
    lat: f64,
    lon: f64,
    t: f64,
    fuel: f64,
    gs: Option<f64>,
    track: Option<f64>,
    flown: Option<Flown>,
}

/// The point a fraction `f` of the way from `a` to `b` on the great circle
/// between them, the way the planner's legs run.
fn between(a: LatLon, b: LatLon, f: f64) -> LatLon {
    if f <= 0.0 {
        return a;
    }
    if f >= 1.0 {
        return b;
    }
    destination(a.0, a.1, bearing_deg(a.0, a.1, b.0, b.1), distance_nm(a.0, a.1, b.0, b.1) * f)
}

/// The distance along a path to each of its points, nm.
fn cumulative(path: &[LatLon]) -> Vec<f64> {
    let mut at = vec![0.0];
    for i in 1..path.len() {
        at.push(at[i - 1] + distance_nm(path[i - 1].0, path[i - 1].1, path[i].0, path[i].1));
    }
    at
}

/// The point `s` nm along a path (`at` the distance to each of its
/// points), on the great circle between the two either side, and the track
/// between them.
fn on_path(path: &[LatLon], at: &[f64], s: f64) -> (LatLon, f64) {
    match path.len() {
        0 => return ((f64::NAN, f64::NAN), f64::NAN),
        1 => return (path[0], 0.0),
        _ => {}
    }
    let mut i = 1;
    while i < path.len() - 1 && at[i] < s {
        i += 1;
    }
    let (a, b) = (path[i - 1], path[i]);
    let f = if at[i] > at[i - 1] { (s - at[i - 1]) / (at[i] - at[i - 1]) } else { 1.0 };
    (between(a, b, f), bearing_deg(a.0, a.1, b.0, b.1))
}

/// The height at `along` on a line of heights, held past its ends; the fraction first, so a point's height comes back whole.
fn height_on(line: &[ProfilePoint], along: f64) -> Option<f64> {
    let first = line.first()?;
    if along <= first.along_nm {
        return Some(first.plan_ft);
    }
    for w in line.windows(2) {
        let (a, b) = (w[0], w[1]);
        if along <= b.along_nm {
            return Some(if b.along_nm > a.along_nm {
                a.plan_ft + (b.plan_ft - a.plan_ft) * ((along - a.along_nm) / (b.along_nm - a.along_nm))
            } else {
                b.plan_ft
            });
        }
    }
    line.last().map(|p| p.plan_ft)
}

/// The heights a missed approach is flown at: from the height the descent
/// to the runway reaches at the missed approach point (`start`, nm along
/// the path, at `from`; the decision altitude or MDA itself left out), up
/// at the standard gradient to `to`, and level there to the path's `end`.
fn missed_heights(start: f64, end: f64, from: f64, to: f64) -> Vec<ProfilePoint> {
    let level = js_max(from, to);
    let top = start + (level - from) / MISSED_CLIMB_FT_PER_NM;
    if top >= end {
        return vec![ProfilePoint { along_nm: end, plan_ft: from + (end - start) * MISSED_CLIMB_FT_PER_NM }];
    }
    vec![ProfilePoint { along_nm: top, plan_ft: level }, ProfilePoint { along_nm: end, plan_ft: level }]
}

/// Sorted, each once: a JavaScript Set of numbers, sorted.
fn sorted_once(mut marks: Vec<f64>) -> Vec<f64> {
    crate::sort::StableSort::stable_sort_by(&mut marks[..], |x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    marks.dedup();
    marks
}

/// The heights a leg flown into a field by its procedures is flown at,
/// along its path (`at`, nm from the leg's start): the plan's own up to its
/// cruise (`climb`, its height `s` nm into the leg), and no higher than
/// each altitude the chart sets (`ft`, one a point) allows -- held until a
/// descent at three to one, the rate the plan descends at
/// (DESCENT_FT_PER_NM), crosses the next at it, straight to the next where
/// the two are closer than that allows -- and from the last down to the
/// field's `field` ft at the path's end. One the chart sets over the leg's
/// cruise (`cruise`) is left out, at the owner's word (a PA28 at 2,000 ft
/// climbed to BENKY6's 12,000 on its way into O'Hare): the plan's altitude
/// stands, as a controller would assign it. A final approach fix is set for
/// its glide path, normally 3° (AIM 1-1-9), 318 ft a mile against the
/// plan's 333, so the last of it is the glide path near enough.
fn landing_heights(at: &[f64], ft: &[Option<f64>], cruise: f64, field: f64, climb: &dyn Fn(f64) -> f64) -> Vec<ProfilePoint> {
    let end = *at.last().unwrap_or(&0.0);
    let mut targets = vec![(0.0, cruise)];
    let inner = at.len().saturating_sub(1);
    for (&s, x) in at.iter().zip(ft).take(inner).skip(1) {
        if let Some(x) = *x
            && x <= cruise
        {
            targets.push((s, x));
        }
    }
    targets.push((end, field));
    let mut chart = vec![ProfilePoint { along_nm: 0.0, plan_ft: cruise }];
    for w in targets.windows(2) {
        let ((a_s, a_ft), (b_s, b_ft)) = (w[0], w[1]);
        let down = (a_ft - b_ft) / DESCENT_FT_PER_NM;
        if down > 0.0 && down < b_s - a_s {
            chart.push(ProfilePoint { along_nm: b_s - down, plan_ft: a_ft });
        }
        chart.push(ProfilePoint { along_nm: b_s, plan_ft: b_ft });
    }
    // The lower of the two at each bend of either, and every STEP_NM
    // between, so the climb's top and the chart's descents meet near enough.
    let mut marks: Vec<f64> = chart.iter().map(|p| p.along_nm).chain(at.iter().copied()).collect();
    let mut s = STEP_NM;
    while s < end {
        marks.push(s);
        s += STEP_NM;
    }
    sorted_once(marks)
        .into_iter()
        .map(|s| ProfilePoint { along_nm: s, plan_ft: js_min(climb(s), height_on(&chart, s).unwrap_or(cruise)) })
        .collect()
}

fn path_of(v: Option<&Value>) -> Vec<LatLon> {
    v.and_then(Value::as_array)
        .map(|points| {
            points
                .iter()
                .map(|p| {
                    let ll = p.as_array().unwrap_or(&[]);
                    let at = |i: usize| ll.get(i).and_then(Value::as_f64).unwrap_or(f64::NAN);
                    (at(0), at(1))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn index(v: &Value, key: &str) -> Option<usize> {
    maybe(v, key).filter(|i| *i >= 0.0 && i.fract() == 0.0).map(|i| i as usize)
}

/// A piece of a leg with the pilot's hold on it (the planner's LegHold), as
/// the dry run flies it: round the racetrack the planner drew from the
/// hold's point -- its turns, or as many as its minutes make (rounded, one
/// at the least) -- then on to the piece's end; or, into the destination,
/// to the field and round it there. Level round the racetrack at the
/// plan's height where it starts (into the destination, the plan's height a
/// mile out), the plan's own along the rest, laid over the piece's straight
/// part.
fn held_path(hold: &Value, from: LatLon, to: LatLon, route_nm: f64, route_at: f64, plan: &[ProfilePoint]) -> Flown {
    let lap = path_of(hold.get("path"));
    let laps = js_round(f(hold, "minutes") / js_max(0.1, f(hold, "lap_min"))).max(1);
    let mut track: Vec<LatLon> = Vec::new();
    for k in 0..laps {
        track.extend_from_slice(if k == 0 { &lap[..] } else { lap.get(1..).unwrap_or(&[]) });
    }
    let laps_nm = *cumulative(&track).last().unwrap_or(&0.0);
    let straight_nm = distance_nm(from.0, from.1, to.0, to.1);
    // The plan's heights over the piece's straight part, starting `offset`
    // nm along the path.
    let planned = |offset: f64| -> Vec<ProfilePoint> {
        plan.iter()
            .filter(|p| p.along_nm > route_at && p.along_nm < route_at + route_nm)
            .map(|p| ProfilePoint {
                along_nm: offset + ((p.along_nm - route_at) * straight_nm) / js_max(1e-9, route_nm),
                plan_ft: p.plan_ft,
            })
            .collect()
    };
    let h = |route: f64| height_on(plan, route).unwrap_or(0.0);
    let point = |along_nm: f64, plan_ft: f64| ProfilePoint { along_nm, plan_ft };
    if matches!(hold.get("at_end"), Some(Value::Bool(true))) {
        let held = h(js_max(route_at, route_at + route_nm - 1.0));
        let mut path = vec![from];
        path.extend(track);
        let mut heights = vec![point(0.0, h(route_at))];
        heights.extend(planned(0.0).into_iter().filter(|p| p.along_nm < straight_nm));
        heights.push(point(straight_nm, held));
        heights.push(point(straight_nm + laps_nm, held));
        let at = cumulative(&path);
        return Flown { path, at, heights: Some(heights) };
    }
    let level = h(route_at);
    let mut path = track;
    path.push(to);
    let mut heights = vec![point(0.0, level), point(laps_nm, level)];
    heights.extend(planned(laps_nm));
    heights.push(point(laps_nm + straight_nm, h(route_at + route_nm)));
    let at = cumulative(&path);
    Flown { path, at, heights: Some(heights) }
}

fn truthy(v: Option<&Value>) -> bool {
    !matches!(v, None | Some(Value::Null) | Some(Value::Bool(false)))
}

mod run;
pub use run::*;
mod render;
pub use render::*;
