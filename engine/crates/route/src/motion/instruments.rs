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

use super::fuel_left::{burnt, fuel_at, Tanks};
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
/// The ring's points: one every five degrees, round to a smooth circle at
/// any zoom a pilot reads it at.
pub const RING_POINTS: usize = 72;

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

/// A glide ring: its range, nm, the ground it is reckoned over, ft, and
/// its outline, latitude and longitude.
pub type GlideRing = (f64, f64, Vec<(f64, f64)>);

/// The glide ring: its radius (motion::glide's still-air range at the picked airplane's own glide ratio) over the higher of
/// the ground under the airplane (the pack's terrain grid) and the nearest field's elevation, and its outline on the sphere
/// for a map that draws polygons. None on the ground, under flying speed, with no height or no glide ratio.
pub fn glide_ring(
    lat: f64, lon: f64, altitude_ft: Option<f64>, speed_kt: Option<f64>, terrain_ft: Option<f64>, field_ft: Option<f64>,
    glide_ratio: Option<f64>,
) -> Option<GlideRing> {
    // The higher ground of the two: the ring is how far the airplane
    // glides before it meets it, so the lower would draw it too wide.
    let ground = match (terrain_ft, field_ft) {
        (Some(t), Some(f)) => Some(t.max(f)),
        (t, f) => t.or(f),
    };
    let range = glide::range_nm(altitude_ft, speed_kt, ground, glide_ratio)?;
    let ring = (0..=RING_POINTS).map(|k| destination(lat, lon, 360.0 * (k % RING_POINTS) as f64 / RING_POINTS as f64, range)).collect();
    Some((range, ground?, ring))
}

// --- By name ---------------------------------------------------------------

fn pair(n: &str, v: &Value) -> Result<(f64, f64), String> {
    match v.as_array() {
        Some([a, b]) => Ok((
            a.as_f64().ok_or_else(|| format!("{n}: a point is not [lat, lon]"))?,
            b.as_f64().ok_or_else(|| format!("{n}: a point is not [lat, lon]"))?,
        )),
        _ => Err(format!("{n}: a point is not [lat, lon]")),
    }
}

fn list<'a>(n: &str, v: &'a Value, key: &str) -> Result<&'a [Value], String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{n}: \"{key}\" is not a list")),
    }
}

fn ahead_json(out: &mut String, a: &Option<Ahead>) {
    let Some(a) = a else {
        out.push_str("null");
        return;
    };
    out.push_str(&format!("{{\"index\":{},\"name\":", a.index));
    json::string(out, &a.name);
    for (key, v) in [
        ("distance_nm", Some(a.distance_nm)),
        ("bearing_deg", Some(a.bearing_deg)),
        ("bearing_mag_deg", a.bearing_mag_deg),
        ("ete_min", a.ete_min),
        ("eta_s", a.eta_s),
        ("fuel_left_gal", a.fuel_left_gal),
    ] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(out, v);
    }
    out.push('}');
}

/// `in_flight`: the instruments or null, from `{"fix": {"lat", "lon",
/// "track_deg"?, "speed_kt"?}, "line": [[lat, lon]], "points": [{"name",
/// "lat", "lon"}], "legs"?: [{"distance_nm", "fuel_gal"?}],
/// "fuel_start_gal"?, "now_s"?}`.
pub(super) fn in_flight_rule(v: &Value) -> Result<String, String> {
    let n = "in_flight";
    let f = v.get("fix").ok_or("in_flight: \"fix\" is missing")?;
    let fix = Fix { lat: num(n, f, "lat")?, lon: num(n, f, "lon")?, track_deg: opt(n, f, "track_deg")?, speed_kt: opt(n, f, "speed_kt")? };
    let line = list(n, v, "line")?.iter().map(|p| pair(n, p)).collect::<Result<Vec<_>, _>>()?;
    let points = list(n, v, "points")?
        .iter()
        .map(|p| {
            Ok(Point {
                name: p.get("name").and_then(Value::as_str).unwrap_or("").to_owned(),
                lat: num(n, p, "lat")?,
                lon: num(n, p, "lon")?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let legs = list(n, v, "legs")?
        .iter()
        .map(|l| Ok(Leg { distance_nm: num(n, l, "distance_nm")?, fuel_gal: opt(n, l, "fuel_gal")? }))
        .collect::<Result<Vec<_>, String>>()?;
    let refuel_at: Vec<f64> = v.get("refuel_at").and_then(Value::as_array).map_or(vec![], |a| a.iter().filter_map(Value::as_f64).collect());
    let tanks = Tanks {
        start_gal: opt(n, v, "fuel_start_gal")?,
        full_gal: opt(n, v, "fuel_full_gal")?,
        taxi_gal: opt(n, v, "taxi_fuel_gal")?,
        refuel_at: refuel_at.into_iter().filter(|k| *k >= 0.0).map(|k| k as usize).collect(),
    };
    let Some(i) = in_flight(fix, &line, &points, &legs, &tanks, opt(n, v, "now_s")?) else {
        return Ok("null".to_owned());
    };
    let mut out = format!("{{\"on_route\":{}", i.on_route);
    for (key, x) in
        [("along_nm", i.along_nm), ("total_nm", i.total_nm), ("left_nm", (i.total_nm - i.along_nm).max(0.0)), ("off_nm", i.off_nm)]
    {
        out.push_str(&format!(",\"{key}\":"));
        json::number(&mut out, x);
    }
    out.push_str(",\"off_side\":");
    // No side to a position on the line, to a tenth of a mile.
    out.push_str(if i.off_nm < 0.05 {
        "null"
    } else if i.left_of_line {
        "\"left\""
    } else {
        "\"right\""
    });
    for (key, x) in [
        ("desired_track_deg", Some(i.desired_track_deg)),
        ("desired_track_mag_deg", i.desired_track_mag_deg),
        ("track_mag_deg", i.track_mag_deg),
        ("track_error_deg", i.track_error_deg),
        ("variation_deg", i.variation_deg),
        ("burnt_gal", Some(i.burnt_gal)),
        ("fuel_now_gal", i.fuel_now_gal),
    ] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(&mut out, x);
    }
    out.push_str(&format!(",\"taxi_counted\":{}", tanks.taxi_gal.is_some()));
    out.push_str(",\"next\":");
    ahead_json(&mut out, &i.next);
    out.push_str(",\"destination\":");
    ahead_json(&mut out, &i.destination);
    out.push('}');
    Ok(out)
}

/// `vertical_speed`: ft a minute or null, from `{"samples": [{"t_s",
/// "altitude_ft"}]}`.
pub(super) fn vertical_speed_rule(v: &Value) -> Result<String, String> {
    let n = "vertical_speed";
    let samples = list(n, v, "samples")?
        .iter()
        .filter_map(|s| match (opt(n, s, "t_s"), opt(n, s, "altitude_ft")) {
            (Ok(Some(t)), Ok(Some(a))) => Some(Ok((t, a))),
            (Err(e), _) | (_, Err(e)) => Some(Err(e)),
            _ => None,
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut out = String::new();
    json::opt_number(&mut out, vertical_speed(&samples));
    Ok(out)
}

/// `glide_ring`: `{"range_nm", "ground_ft", "ring": [[lat, lon]]}` or null, from `{"lat", "lon", "altitude_ft"?,
/// "speed_kt"?, "terrain_ft"?, "field_ft"?, "glide_ratio"?}`.
pub(super) fn glide_ring_rule(v: &Value) -> Result<String, String> {
    let n = "glide_ring";
    let Some((range, ground, ring)) = glide_ring(
        num(n, v, "lat")?,
        num(n, v, "lon")?,
        opt(n, v, "altitude_ft")?,
        opt(n, v, "speed_kt")?,
        opt(n, v, "terrain_ft")?,
        opt(n, v, "field_ft")?,
        opt(n, v, "glide_ratio")?,
    ) else {
        return Ok("null".to_owned());
    };
    let mut out = String::from("{\"range_nm\":");
    json::number(&mut out, range);
    out.push_str(",\"ground_ft\":");
    json::number(&mut out, ground);
    out.push_str(",\"ring\":[");
    for (k, (lat, lon)) in ring.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push('[');
        json::number(&mut out, *lat);
        out.push(',');
        json::number(&mut out, *lon);
        out.push(']');
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests;
