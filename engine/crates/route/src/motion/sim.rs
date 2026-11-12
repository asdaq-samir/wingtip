//! A recorded flight made ready for a flight simulator's replay (the web's
//! lib/replay/simExport: X-Plane's FDR, Sky Dolly's CSV, FlightAware's KML
//! for FlightControlReplay, Google Earth's KML, GPX): the track made ready
//! (replay_track) drawn as a smooth path at a steady frame rate, its
//! altitude above sea level where the altimeter setting is known, and the
//! attitude, gear, flaps and lights a simulator draws, all estimated
//! (sim_config). One copy, so the Studio and Plan's past flights export
//! the same airplane.
//!
//! Nothing is drawn across a gap: each run of reports between two gaps
//! (replay_track's `gap`) is its own segment, which a format that cannot
//! say "no data here" writes as its own file.
//!
//! - The path between two reports is a cubic Hermite spline (C. de Boor,
//!   A Practical Guide to Splines, 1978, ch. IV): through both positions,
//!   with the velocity each report sent (ADS-B's ground speed and track)
//!   as its slope, so it bends as the airplane turned instead of drawing
//!   corners, and passes every report. Where a report sent no velocity,
//!   the slope is the chord of its neighbours (Catmull and Rom's, 1974).
//! - The height the same, its slope the vertical speed replay_track read.
//! - The ADS-B altitude is pressure altitude (29.92 inHg, 14 CFR
//!   91.217(a)(2)); a simulator wants height above sea level. Where the
//!   airplane sent its crew's altimeter setting (ADS-B version 2's
//!   barometric pressure setting, readsb's `nav_qnh`) below 18,000 ft --
//!   where 14 CFR 91.121(a)(1) has it set to a station within 100 nm --
//!   the altitude is set on it as an altimeter there reads it, the
//!   standard atmosphere's height of the setting above 29.92 (the
//!   flight crate's pressure_altitude_ft, FAA-H-8083-25C ch. 11), each
//!   moment on the setting nearest in time, between two in proportion.
//!   With none, it is left as pressure altitude and the segment says so.

use super::sim_config::{self, Config, Frame};
use wingtip_core::geo::EARTH_RADIUS_NM;
use wingtip_core::wmm;
use wingtip_flight::flight;

/// Rows a second where none is asked: X-Plane's FDR replay reads every
/// row as a frame, and ten a second is what the owner asked as the least
/// for a fluid replay (2026-11-12).
pub const RATE_HZ: f64 = 10.0;
/// The most rows a second written: past a simulator's own frame rate a
/// row is never seen.
pub const MAX_RATE_HZ: f64 = 60.0;
/// The heading, bank and pitch are averaged over this each side, s, so the
/// airplane rolls into a turn before its heading moves and out before it
/// stops, as a pilot does: the Instrument Flying Handbook leads a
/// roll-out by half the bank (FAA-H-8083-15B ch. 7, "Turns": 7.5 degrees
/// of heading for a 15 degree bank, 2.5 s at standard rate, 3 degrees a
/// second). The spline's turn rate also steps at each report, which this
/// smooths away rather than letting the wings jerk.
pub const ATTITUDE_SPAN_S: f64 = 2.5;
/// Standard gravity, m/s^2 (CGPM 1901; ISO 80000-3).
const G_MS2: f64 = 9.80665;
const MS_PER_KT: f64 = 1852.0 / 3600.0;
const FTS_PER_KT: f64 = 1852.0 / 0.3048 / 3600.0;
/// Hectopascals in an inch of mercury (NIST SP 811, B.8: 3,386.389 Pa).
const HPA_PER_INHG: f64 = 33.86389;
/// 14 CFR 91.121(a): the local setting below this, 29.92 at or above.
const STANDARD_SETTING_FT: f64 = 18_000.0;
/// Degrees of latitude a nautical mile, on the engine's sphere (geo).
const DEG_PER_NM: f64 = 180.0 / (std::f64::consts::PI * EARTH_RADIUS_NM);

/// One report made ready (replay_track's sample), with the ground under it.
#[derive(Clone, Debug, PartialEq)]
pub struct Point {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
    pub gs_kt: Option<f64>,
    pub track_deg: Option<f64>,
    pub vs_fpm: Option<f64>,
    pub along_nm: f64,
    pub gap: bool,
    pub ground: bool,
}

/// An altimeter setting the airplane sent: when, hPa, and its pressure
/// altitude then (None on the ground).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Setting {
    pub t: f64,
    pub hpa: f64,
    pub alt_ft: Option<f64>,
}

/// One frame for the simulator. Angles in degrees, true unless named
/// magnetic; pitch up and bank right positive.
#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: f64,
    pub agl_ft: Option<f64>,
    pub gs_kt: f64,
    pub vs_fpm: f64,
    pub track_deg: f64,
    pub heading_mag_deg: f64,
    pub pitch_deg: f64,
    pub bank_deg: f64,
    pub ground: bool,
    pub config: Config,
}

/// A run of reports between two gaps, as frames.
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub rows: Vec<Row>,
    /// Whether `alt_ft` is above sea level (set on the airplane's own
    /// altimeter setting, or sent so) or pressure altitude as sent.
    pub msl: bool,
    /// The first altimeter setting it was set on, hPa.
    pub setting_hpa: Option<f64>,
}

/// The ground's height under the track, ft MSL, by how far along it is.
fn ground_at(ground: &[(f64, f64)], along: f64) -> Option<f64> {
    let i = ground.partition_point(|g| g.0 < along);
    match (i.checked_sub(1).and_then(|j| ground.get(j)), ground.get(i)) {
        (Some(a), Some(b)) if b.0 > a.0 => Some(a.1 + (b.1 - a.1) * (along - a.0) / (b.0 - a.0)),
        (Some(a), _) => Some(a.1),
        (None, Some(b)) => Some(b.1),
        (None, None) => None,
    }
}

/// The altimeter setting's shift at `t`, ft: what is added to a pressure
/// altitude to read it on the setting (module note); None with none sent
/// in the run.
fn shift_at(settings: &[Setting], t: f64) -> Option<f64> {
    let shift = |s: &Setting| -flight::pressure_altitude_ft(0.0, s.hpa / HPA_PER_INHG);
    let i = settings.partition_point(|s| s.t < t);
    match (i.checked_sub(1).and_then(|j| settings.get(j)), settings.get(i)) {
        (Some(a), Some(b)) if b.t > a.t => Some(shift(a) + (shift(b) - shift(a)) * (t - a.t) / (b.t - a.t)),
        (Some(a), _) => Some(shift(a)),
        (None, Some(b)) => Some(shift(b)),
        (None, None) => None,
    }
}

/// Cubic Hermite on [0, 1] (de Boor, ch. IV): the value and its slope per
/// unit of `s`, between p0 and p1 with slopes m0, m1 per unit of `s`.
fn hermite(s: f64, p0: f64, m0: f64, p1: f64, m1: f64) -> (f64, f64) {
    let (s2, s3) = (s * s, s * s * s);
    let value = (2.0 * s3 - 3.0 * s2 + 1.0) * p0 + (s3 - 2.0 * s2 + s) * m0 + (-2.0 * s3 + 3.0 * s2) * p1 + (s3 - s2) * m1;
    let slope = (6.0 * s2 - 6.0 * s) * p0 + (3.0 * s2 - 4.0 * s + 1.0) * m0 + (-6.0 * s2 + 6.0 * s) * p1 + (3.0 * s2 - 2.0 * s) * m1;
    (value, slope)
}

/// The signed change from one heading to the next, -180 to 180.
fn turn(from: f64, to: f64) -> f64 {
    (to - from + 540.0).rem_euclid(360.0) - 180.0
}

/// Each value averaged with those within `span` rows each side (a
/// centred moving average, by running sums).
fn smooth(values: &[f64], span: usize) -> Vec<f64> {
    let mut sums = Vec::with_capacity(values.len() + 1);
    sums.push(0.0);
    for v in values {
        sums.push(sums.last().copied().unwrap_or(0.0) + v);
    }
    (0..values.len())
        .map(|i| {
            let (a, b) = (i.saturating_sub(span), (i + span + 1).min(values.len()));
            (sums[b] - sums[a]) / (b - a) as f64
        })
        .collect()
}

/// One run of points as frames `rate` a second (the module note).
fn frames(run: &[Point], settings: &[Setting], ground: &[(f64, f64)], pressure: bool, rate: f64) -> Segment {
    let n = run.len();
    let own: Vec<Setting> = settings
        .iter()
        .filter(|s| s.t >= run[0].t && s.t <= run[n - 1].t && s.alt_ft.is_none_or(|a| a < STANDARD_SETTING_FT))
        .copied()
        .collect();
    let set = pressure && !own.is_empty();
    // Each point's height above sea level: the ground's on the ground,
    // else its altitude set on the setting; where neither, its neighbours'.
    let base: Vec<Option<f64>> = run
        .iter()
        .map(|p| match (p.ground, ground_at(ground, p.along_nm), p.alt_ft) {
            (true, Some(g), _) => Some(g),
            (_, _, Some(a)) => Some(a + if set { shift_at(&own, p.t).unwrap_or(0.0) } else { 0.0 }),
            _ => None,
        })
        .collect();
    let known: Vec<(f64, f64)> = run.iter().zip(&base).filter_map(|(p, a)| Some((p.t, (*a)?))).collect();
    let alt: Vec<f64> = run
        .iter()
        .zip(&base)
        .map(|(p, a)| a.unwrap_or_else(|| known.iter().min_by(|x, y| (x.0 - p.t).abs().total_cmp(&(y.0 - p.t).abs())).map_or(0.0, |k| k.1)))
        .collect();
    // Slopes per second: the velocity sent, else the neighbours' chord.
    let chord = |i: usize, f: &dyn Fn(usize) -> f64| {
        let (a, b) = (i.saturating_sub(1), (i + 1).min(n - 1));
        if run[b].t > run[a].t {
            (f(b) - f(a)) / (run[b].t - run[a].t)
        } else {
            0.0
        }
    };
    let slopes: Vec<(f64, f64, f64)> = (0..n)
        .map(|i| {
            let p = &run[i];
            // Airborne only: a surface report's velocity is often stale
            // against its position, which bends the path on the taxiway.
            let (dlat, dlon) = match (p.gs_kt, p.track_deg) {
                (Some(gs), Some(tr)) if !p.ground => {
                    let nm_s = gs / 3600.0;
                    let r = tr.to_radians();
                    (nm_s * r.cos() * DEG_PER_NM, nm_s * r.sin() * DEG_PER_NM / p.lat.to_radians().cos().max(0.01))
                }
                _ => (chord(i, &|j| run[j].lat), chord(i, &|j| run[j].lon)),
            };
            let dalt = match (p.ground, p.vs_fpm) {
                (true, _) => 0.0,
                (false, Some(vs)) if base[i].is_some() => vs / 60.0,
                _ => chord(i, &|j| alt[j]),
            };
            (dlat, dlon, dalt)
        })
        .collect();

    // The variation at each report, between them in proportion: the
    // model's sum is too dear for every frame and changes a degree in a
    // hundred miles.
    let variation: Vec<f64> = run.iter().map(|p| wmm::declination(p.lat, p.lon, wmm::year_at(p.t))).collect();
    let step = 1.0 / rate;
    let count = ((run[n - 1].t - run[0].t) / step).floor() as usize + 1;
    let mut frames: Vec<Frame> = Vec::with_capacity(count);
    let mut place: Vec<(f64, f64, f64, f64)> = Vec::with_capacity(count);
    let mut k = 0;
    for f in 0..count {
        let t = run[0].t + f as f64 * step;
        while k + 2 < n && run[k + 1].t <= t {
            k += 1;
        }
        // k + 1 < n: a run has two points or more, and k stops short.
        let j = k + 1;
        let (a, b) = (&run[k], &run[j]);
        let h = b.t - a.t;
        let s = if h > 0.0 { ((t - a.t) / h).clamp(0.0, 1.0) } else { 0.0 };
        let (lat, dlat) = hermite(s, a.lat, slopes[k].0 * h, b.lat, slopes[j].0 * h);
        let (lon, dlon) = hermite(s, a.lon, slopes[k].1 * h, b.lon, slopes[j].1 * h);
        let (alt_ft, dalt) = hermite(s, alt[k], slopes[k].2 * h, alt[j], slopes[j].2 * h);
        let per_s = if h > 0.0 { 1.0 / h } else { 0.0 };
        let (north_nm_s, east_nm_s) = (dlat * per_s / DEG_PER_NM, dlon * per_s / DEG_PER_NM * lat.to_radians().cos());
        let path_kt = north_nm_s.hypot(east_nm_s) * 3600.0;
        let on_ground = a.ground && b.ground;
        // The ground speed sent, between two reports in proportion: the
        // path's own slope wavers where the reports' times and places
        // disagree by a little.
        let gs_kt = match (a.gs_kt, b.gs_kt) {
            (Some(x), Some(y)) => x + (y - x) * s,
            _ => path_kt,
        };
        // The track the path takes; on the ground the track sent, as a
        // surface position wanders; a stopped airplane's holds the last.
        let track = match (on_ground, a.track_deg, b.track_deg) {
            (true, Some(x), Some(y)) => (x + turn(x, y) * s).rem_euclid(360.0),
            _ if path_kt > 0.5 => east_nm_s.atan2(north_nm_s).to_degrees().rem_euclid(360.0),
            _ => place.last().map_or(a.track_deg.unwrap_or(0.0), |p| p.2),
        };
        let ground_ft = ground_at(ground, a.along_nm + (b.along_nm - a.along_nm) * s);
        // Never under the ground: a pressure altitude off by the day's
        // pressure, or a curve dipping after the wheels leave, would put
        // it there.
        let alt_ft = match ground_ft {
            Some(g) if !on_ground => alt_ft.max(g),
            _ => alt_ft,
        };
        frames.push(Frame {
            t,
            ground: on_ground,
            gs_kt,
            vs_fpm: if on_ground { 0.0 } else { dalt * per_s * 60.0 },
            alt_ft,
            agl_ft: ground_ft.map(|g| alt_ft - g),
        });
        place.push((lat, lon, track, variation[k] + (variation[j] - variation[k]) * s));
    }
    // The attitude a coordinated airplane has (module note): bank from
    // the turn, tan(bank) = V x turn rate / g, the horizontal component
    // of lift turning it (FAA-H-8083-25C ch. 5, "Forces in turns"); pitch
    // the flight path's angle, atan(climb / ground speed). Level on the
    // ground. Estimated: the wind, the angle of attack and any slip are
    // not known.
    let m = frames.len();
    let span = (ATTITUDE_SPAN_S * rate).round() as usize;
    // The heading averaged the same way, unwound so 359 and 1 average to
    // 0: the track a curve gives wavers a degree or two about each report
    // (ADS-B sends it in steps), which a simulator shows as the nose
    // twitching.
    let mut unwound = Vec::with_capacity(m);
    for (i, p) in place.iter().enumerate() {
        unwound.push(if i == 0 { p.2 } else { unwound[i - 1] + turn(place[i - 1].2, p.2) });
    }
    let heading = smooth(&unwound, span);
    let bank_raw: Vec<f64> = (0..m)
        .map(|i| {
            let (a, b) = (i.saturating_sub(1), (i + 1).min(m - 1));
            if frames[i].ground || b == a {
                return 0.0;
            }
            let rate_rad_s = (heading[b] - heading[a]).to_radians() / (frames[b].t - frames[a].t);
            (frames[i].gs_kt * MS_PER_KT * rate_rad_s / G_MS2).atan().to_degrees()
        })
        .collect();
    let pitch_raw: Vec<f64> =
        frames.iter().map(|f| if f.ground { 0.0 } else { (f.vs_fpm / 60.0).atan2((f.gs_kt * FTS_PER_KT).max(1.0)).to_degrees() }).collect();
    let (bank, pitch) = (smooth(&bank_raw, span), smooth(&pitch_raw, span));
    // The configuration reads the ground and vertical speeds averaged as
    // the attitude is, so a light does not flicker as a taxi wavers about
    // its limit, nor the gear drop for a moment's sink in the climb.
    let gs_smooth = smooth(&frames.iter().map(|f| f.gs_kt).collect::<Vec<_>>(), span);
    let vs_smooth = smooth(&frames.iter().map(|f| f.vs_fpm).collect::<Vec<_>>(), span);
    let configs = sim_config::configure(
        &frames.iter().enumerate().map(|(i, f)| Frame { gs_kt: gs_smooth[i], vs_fpm: vs_smooth[i], ..*f }).collect::<Vec<_>>(),
    );
    let rows = frames
        .iter()
        .zip(&place)
        .enumerate()
        .map(|(i, (f, p))| Row {
            t: f.t,
            lat: p.0,
            lon: p.1,
            alt_ft: f.alt_ft,
            agl_ft: f.agl_ft,
            gs_kt: f.gs_kt,
            vs_fpm: f.vs_fpm,
            track_deg: heading[i].rem_euclid(360.0),
            heading_mag_deg: (heading[i] - p.3).rem_euclid(360.0),
            pitch_deg: pitch[i],
            bank_deg: bank[i],
            ground: f.ground,
            config: configs[i],
        })
        .collect();
    Segment { rows, msl: !pressure || set, setting_hpa: own.first().filter(|_| set).map(|s| s.hpa) }
}

/// The runs of points between gaps that meet [from, to], as frames.
pub fn sim_flight(
    points: &[Point], settings: &[Setting], ground: &[(f64, f64)], pressure: bool, window: (f64, f64), rate: f64,
) -> Vec<Segment> {
    let mut runs: Vec<&[Point]> = Vec::new();
    let mut start = 0;
    for i in 1..=points.len() {
        if i == points.len() || points[i].gap {
            runs.push(&points[start..i]);
            start = i;
        }
    }
    runs.into_iter()
        .filter(|r| r.len() > 1 && r[r.len() - 1].t >= window.0 && r[0].t <= window.1)
        .map(|r| frames(r, settings, ground, pressure, rate))
        .collect()
}

#[cfg(test)]
#[path = "sim_tests.rs"]
mod tests;
