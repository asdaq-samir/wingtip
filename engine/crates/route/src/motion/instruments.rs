//! The instruments of a flight under way, from own ship's GPS fix and the
//! planned route (#218, the owner's option A of 2026-11-08): where on the
//! route the airplane is, the next waypoint's distance, bearing, time and
//! arrival, the destination's, the desired track against the track flown
//! and how far off the line, the fuel the plan leaves at each; the
//! vertical speed from the fix's own altitudes; and the still-air glide
//! ring about the airplane over the ground under it. One copy for the
//! iPhone, Android and the web (the generated `call`, callEngine), where FiguresStrip's
//! own arithmetic (the phone's Flight.along, burnt and off) was before.
//!
//! Figures for a planning aid flown beside the airplane's own
//! instruments, never in their place: a phone's GPS is not an approved
//! navigation source, and "the flightcrew's reference for maneuvering the
//! aircraft in the air is the installed primary flight and navigational
//! displays" (FAA AC 120-76D, Authorization for Use of Electronic Flight
//! Bags, 11.17.1); the apps say so where they show them.

use super::fuel_left::{burnt, fuel_at, hop_at, hop_burnt, Tanks};
// The glide ring moved to glide.rs; its tests here read it by this path.
pub use super::glide::{glide_ring, GlideRing, RING_POINTS};
use super::{glide, num, opt};
use crate::geo::{bearing_deg, destination, distance_nm, py_mod};
use crate::json::{self, Value};

/// Within this of the course line the airplane is flying the route, and
/// its figures count down from where it is; farther off it is going
/// somewhere else (a diversion, a pattern), and the plan's own figures
/// stand: route_position's tolerance (along::on_route), the debrief's
/// OFF_ROUTE_NM (ACS PA.VI.A.S5), so the two answers agree.
pub const ON_ROUTE_NM: f64 = crate::figures::debrief::OFF_ROUTE_NM;
/// The vertical speed is the slope of the GPS altitudes over this many
/// seconds, the newest last: a phone's GPS altitude wanders by tens of
/// feet fix to fix (Apple's CLLocation verticalAccuracy, Android's
/// Location verticalAccuracyMeters), so one second's difference would
/// swing by thousands of feet a minute. A design choice, about what a
/// VSI's own lag is.
pub const VS_WINDOW_S: f64 = 10.0;
/// And at least this many seconds of them, three fixes at one a second.
pub const VS_LEAST_S: f64 = 2.0;

/// Own ship's fix as the apps send it.
#[derive(Clone, Copy, Debug, Default)]
pub struct Fix {
    pub lat: f64,
    pub lon: f64,
    pub track_deg: Option<f64>,
    pub speed_kt: Option<f64>,
}

/// A point of the route by name.
#[derive(Clone, Debug)]
pub struct Point {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
}

/// A leg of the nav log: its miles and the fuel the plan burns on it.
#[derive(Clone, Copy, Debug)]
pub struct Leg {
    pub distance_nm: f64,
    pub fuel_gal: Option<f64>,
}

/// Where a position is against the line: miles along it to the nearest
/// point, miles off it, the segment that point is on, and which side the
/// position lies (true for left of the direction of flight).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Along {
    pub along_nm: f64,
    pub off_nm: f64,
    pub segment: usize,
    pub left: bool,
}

fn lengths(line: &[(f64, f64)]) -> Vec<f64> {
    line.windows(2).map(|w| distance_nm(w[0].0, w[0].1, w[1].0, w[1].1)).collect()
}

/// The nearest point of the line's segments from `from` on, on a flat
/// patch of the earth round each segment, which a leg of a few miles is:
/// FiguresStrip's own projection (the phone's Flight.along) before it
/// moved here. None for a line of fewer than two points.
pub fn along(line: &[(f64, f64)], lengths: &[f64], lat: f64, lon: f64, from: usize) -> Option<Along> {
    if line.len() < 2 {
        return None;
    }
    let mut best: Option<Along> = None;
    let mut cursor: f64 = lengths[..from.min(lengths.len())].iter().sum();
    for i in from.min(lengths.len() - 1)..lengths.len() {
        let (a, b) = (line[i], line[i + 1]);
        let scale = a.0.to_radians().cos();
        let (ax, ay, bx, by) = (a.1 * scale, a.0, b.1 * scale, b.0);
        let (px, py) = (lon * scale, lat);
        let (dx, dy) = (bx - ax, by - ay);
        let t = if dx == 0.0 && dy == 0.0 { 0.0 } else { (((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0) };
        let near = (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t);
        let off = distance_nm(lat, lon, near.0, near.1);
        if best.is_none_or(|b| off < b.off_nm) {
            // Left of the direction of flight where the cross product of
            // the segment and the offset is positive (x east, y north).
            let left = dx * (py - ay) - dy * (px - ax) > 0.0;
            best = Some(Along { along_nm: cursor + lengths[i] * t, off_nm: off, segment: i, left });
        }
        cursor += lengths[i];
    }
    best
}

/// The variation at a point on a day, degrees east positive (the World
/// Magnetic Model, wingtip.magnetic's), the day from Unix seconds.
pub fn variation(lat: f64, lon: f64, now_s: f64) -> f64 {
    let days = (now_s / 86_400.0).floor() as i64;
    let (year, _, _) = crate::time::civil_from_days(days);
    let first = crate::time::days_from_civil(year, 1, 1);
    let of_year = crate::time::days_from_civil(year + 1, 1, 1) - first;
    let decimal = wingtip_core::wmm::decimal_year(year as i32, (days - first + 1) as u32, of_year as u32);
    wingtip_core::wmm::declination(lat, lon, decimal)
}

/// A true direction as magnetic: east variation taken off, west added
/// ("east is least, west is best", FAA Pilot's Handbook of Aeronautical
/// Knowledge, FAA-H-8083-25C, ch. 16, Variation).
pub fn magnetic(true_deg: f64, variation_deg: f64) -> f64 {
    py_mod(true_deg - variation_deg, 360.0)
}

/// One waypoint ahead: its miles and bearing from the airplane (direct to
/// the next; along the route past it for the destination), the time at
/// the groundspeed now and the arrival, and the fuel the plan leaves.
#[derive(Clone, Debug, PartialEq)]
pub struct Ahead {
    pub index: usize,
    pub name: String,
    pub distance_nm: f64,
    pub bearing_deg: f64,
    pub bearing_mag_deg: Option<f64>,
    pub ete_min: Option<f64>,
    pub eta_s: Option<f64>,
    pub fuel_left_gal: Option<f64>,
}

/// The flight's instruments from the fix.
#[derive(Clone, Debug, PartialEq)]
pub struct InFlight {
    pub on_route: bool,
    pub along_nm: f64,
    pub total_nm: f64,
    pub off_nm: f64,
    pub left_of_line: bool,
    pub desired_track_deg: f64,
    pub desired_track_mag_deg: Option<f64>,
    pub track_mag_deg: Option<f64>,
    pub track_error_deg: Option<f64>,
    pub variation_deg: Option<f64>,
    pub burnt_gal: f64,
    /// What the plan leaves in the tanks here (fuel_left), None without
    /// the start's fuel.
    pub fuel_now_gal: Option<f64>,
    /// The leg flown, an index into the nav log's legs (the one from
    /// point `leg` to the next): the one the next waypoint ends. None
    /// with fewer than two points.
    pub leg: Option<usize>,
    /// The hop flown (fuel_left's hop_at): 0 the first, one more past each
    /// fuel stop, an index into the planner's totals' hops.
    pub hop: usize,
    /// The fuel the legs burn from the hop's start to here (fuel_left's
    /// hop_burnt): what the strip's fuel takes off the hop's own figure.
    pub hop_burnt_gal: f64,
    pub next: Option<Ahead>,
    pub destination: Option<Ahead>,
}

/// The instruments: None where there is no line to fly.
pub fn in_flight(fix: Fix, line: &[(f64, f64)], points: &[Point], legs: &[Leg], tanks: &Tanks, now_s: Option<f64>) -> Option<InFlight> {
    let lens = lengths(line);
    let here = along(line, &lens, fix.lat, fix.lon, 0)?;
    let total: f64 = lens.iter().sum();
    let moving = glide::underway(fix.speed_kt);
    let gs = fix.speed_kt.filter(|_| moving);
    let variation_deg = now_s.map(|t| variation(fix.lat, fix.lon, t));
    let (a, b) = (line[here.segment], line[here.segment + 1]);
    // The leg's course where the airplane is: the great circle from the
    // nearest point on to the segment's end.
    let at = destination(a.0, a.1, bearing_deg(a.0, a.1, b.0, b.1), here.along_nm - lens[..here.segment].iter().sum::<f64>());
    let desired =
        if distance_nm(at.0, at.1, b.0, b.1) > 1e-6 { bearing_deg(at.0, at.1, b.0, b.1) } else { bearing_deg(a.0, a.1, b.0, b.1) };
    let track_error_deg = fix.track_deg.filter(|_| moving).map(|t| py_mod(t - desired + 180.0, 360.0) - 180.0);
    // Each point's own place along the line, in order, so a route that
    // doubles back finds each on its own leg.
    let mut from = 0;
    let mut places = Vec::with_capacity(points.len());
    for p in points {
        let found = along(line, &lens, p.lat, p.lon, from);
        if let Some(f) = found {
            from = f.segment;
        }
        places.push(found.map(|f| f.along_nm));
    }
    // From the last fuel stop passed, less each start and taxi (fuel_left).
    let fuel_at = |along_nm: f64| fuel_at(tanks, legs, &places, along_nm);
    let timed = |nm: f64| {
        let ete = gs.map(|g| nm / g * 60.0);
        (ete, ete.zip(now_s).map(|(m, t)| t + m * 60.0))
    };
    let next_index =
        (1..points.len()).find(|&k| places[k].is_some_and(|p| p > here.along_nm)).or(points.len().checked_sub(1).filter(|&k| k > 0));
    let next = next_index.map(|k| {
        let p = &points[k];
        let nm = distance_nm(fix.lat, fix.lon, p.lat, p.lon);
        let bearing = bearing_deg(fix.lat, fix.lon, p.lat, p.lon);
        let (ete_min, eta_s) = timed(nm);
        Ahead {
            index: k,
            name: p.name.clone(),
            distance_nm: nm,
            bearing_deg: bearing,
            bearing_mag_deg: variation_deg.map(|v| magnetic(bearing, v)),
            ete_min,
            eta_s,
            fuel_left_gal: fuel_at(places[k].unwrap_or(total)),
        }
    });
    let destination = next.as_ref().map(|n| {
        let last = points.len() - 1;
        let p = &points[last];
        // Direct to the next, then along the route from it.
        let beyond = (places[last].unwrap_or(total) - places[n.index].unwrap_or(total)).max(0.0);
        let nm = n.distance_nm + beyond;
        let bearing = bearing_deg(fix.lat, fix.lon, p.lat, p.lon);
        let (ete_min, eta_s) = timed(nm);
        Ahead {
            index: last,
            name: p.name.clone(),
            distance_nm: nm,
            bearing_deg: bearing,
            bearing_mag_deg: variation_deg.map(|v| magnetic(bearing, v)),
            ete_min,
            eta_s,
            fuel_left_gal: fuel_at(places[last].unwrap_or(total)),
        }
    });
    Some(InFlight {
        on_route: moving && here.off_nm <= ON_ROUTE_NM,
        along_nm: here.along_nm,
        total_nm: total,
        off_nm: here.off_nm,
        left_of_line: here.left,
        desired_track_deg: desired,
        desired_track_mag_deg: variation_deg.map(|v| magnetic(desired, v)),
        track_mag_deg: fix.track_deg.zip(variation_deg).map(|(t, v)| magnetic(t, v)),
        track_error_deg,
        variation_deg,
        burnt_gal: burnt(legs, here.along_nm),
        fuel_now_gal: fuel_at(here.along_nm),
        leg: next.as_ref().map(|n| n.index - 1),
        hop: hop_at(tanks, &places, here.along_nm).0,
        hop_burnt_gal: hop_burnt(tanks, legs, &places, here.along_nm),
        next,
        destination,
    })
}

/// The vertical speed, ft a minute, from GPS altitudes `(t_s, ft)`: the
/// least-squares slope of the last VS_WINDOW_S seconds of them. None with
/// fewer than three in the window or under VS_LEAST_S seconds of them.
pub fn vertical_speed(samples: &[(f64, f64)]) -> Option<f64> {
    let newest = samples.iter().map(|s| s.0).fold(f64::NEG_INFINITY, f64::max);
    let window: Vec<(f64, f64)> = samples.iter().copied().filter(|s| s.0 >= newest - VS_WINDOW_S && s.1.is_finite()).collect();
    if window.len() < 3 {
        return None;
    }
    let oldest = window.iter().map(|s| s.0).fold(f64::INFINITY, f64::min);
    if newest - oldest < VS_LEAST_S {
        return None;
    }
    let n = window.len() as f64;
    let (mt, ma) = (window.iter().map(|s| s.0).sum::<f64>() / n, window.iter().map(|s| s.1).sum::<f64>() / n);
    let (mut sxy, mut sxx) = (0.0, 0.0);
    for (t, a) in &window {
        sxy += (t - mt) * (a - ma);
        sxx += (t - mt) * (t - mt);
    }
    (sxx > 0.0).then(|| sxy / sxx * 60.0)
}

mod rules;
pub(super) use rules::*;

#[cfg(test)]
mod tests;
