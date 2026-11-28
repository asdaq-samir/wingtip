//! A recorded flight made ready to replay (the web's features/replay):
//! the reports in time order, its holes said as holes, the height and
//! position smoothed a little within each run of reports, and the
//! vertical speed, ground speed and track worked out where they are not
//! sent. One copy for every replay -- an adsb.lol day, a track watched
//! here, an imported KML or CSV -- so the Studio's data block, Plan's past
//! flight and the profile read the same figures.
//!
//! Nothing here is a regulation's figure. The thresholds are the data's:
//!
//! - A gap is no report for GAP_S. readsb's trace (adsb.lol's history)
//!   keeps a point at least every 20 s while it hears the airplane: of
//!   N14511's 4,045 points on 2026-11-10, 99 % came within 20 s of the
//!   last and 13 were more than 60 s apart. Past that the airplane was not
//!   heard, and where it went is not known: a replay holds and says so
//!   rather than drawing a straight line over it.
//! - The height is smoothed over the SMOOTH_ALT_S before each report, on
//!   a straight line fitted through the heights at the report's own time:
//!   a transponder's pressure altitude comes in 25 ft steps (DO-260B, the
//!   barometric altitude's 25 ft quantum), which a point-to-point climb
//!   rate reads as bursts of thousands of feet a minute. Only reports at
//!   or before the moment are read, so the replay never shows a climb or
//!   a descent before it began.
//! - The vertical speed is the rate the report sent (readsb's baro_rate,
//!   else its geometric rate), else the slope of the heights reported in
//!   the VS_SPAN_S before it, as a VSI's own lag averages it
//!   (FAA-H-8083-15B, Ch. 5, the vertical speed indicator: "trend" then
//!   "rate" after 6 to 9 s). A VSI lags; it never leads: N722BD read -550
//!   fpm 79 s before its last report while still climbing, from a slope
//!   that looked 15 s ahead.
//! - A held pressure altitude: readsb can repeat a stale one, N722BD's
//!   8,750 ft for its last 9.7 s while its GNSS height fell from 9,475 to
//!   325 ft. A report is held where it says so (`alt_held`), or where its
//!   pressure altitude has not changed for up to HELD_SPAN_S while the
//!   GNSS height or the rate sent moved more than HELD_FT. Its height is
//!   never read into a fit or a rate; it carries the last good height
//!   forward, marked `alt_held`, never null, so no host draws the airplane
//!   on the ground.

use super::{num, opt, opt_bool};
use crate::geo;
use crate::json::{self, Value};
use crate::sort::StableSort;

/// No report for longer than this, s, is a gap (above).
pub const GAP_S: f64 = 60.0;
/// The height is averaged over this each side of a report, s.
pub const SMOOTH_ALT_S: f64 = 10.0;
/// The position is averaged over this each side, s: a GPS log's jitter,
/// not a turn (a standard-rate turn is 3 degrees a second).
pub const SMOOTH_POS_S: f64 = 2.0;
/// The vertical speed is read from the heights within this before, s.
pub const VS_SPAN_S: f64 = 15.0;
/// A pressure altitude unchanged this long, s, while the GNSS height or the
/// rate sent moved more than HELD_FT, is held (above).
pub const HELD_SPAN_S: f64 = 60.0;
pub const HELD_FT: f64 = 300.0;

/// One report as it came.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    /// Pressure altitude, ft; None on the ground or not sent.
    pub alt_ft: Option<f64>,
    pub gs_kt: Option<f64>,
    pub track_deg: Option<f64>,
    pub ground: bool,
    /// The rates the report sent, ft/min: readsb's baro_rate and geom_rate.
    pub baro_rate_fpm: Option<f64>,
    pub geom_rate_fpm: Option<f64>,
    /// The GNSS (geometric) height, ft, where sent.
    pub alt_geom_ft: Option<f64>,
    /// The caller's word that the pressure altitude is held; None to let
    /// the engine tell (held).
    pub alt_held: Option<bool>,
}

/// One report made ready.
#[derive(Clone, Debug, PartialEq)]
pub struct Sample {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
    /// The height is the last good one carried forward over a held one.
    pub alt_held: bool,
    pub gs_kt: Option<f64>,
    pub track_deg: Option<f64>,
    pub vs_fpm: Option<f64>,
    /// How far along the flight, nm, a gap's straight line counted.
    pub along_nm: f64,
    /// The report after a gap: nothing is known between it and the last.
    pub gap: bool,
    pub ground: bool,
}

/// The reports in time order, each time once, made ready (above); the
/// gaps are the samples whose `gap` is set.
pub fn condition(mut reports: Vec<Report>, gap_s: f64) -> Vec<Sample> {
    reports.retain(|r| r.t.is_finite() && r.lat.abs() <= 90.0 && r.lon.abs() <= 180.0);
    reports.stable_sort_by(|a, b| a.t.total_cmp(&b.t));
    reports.dedup_by(|b, a| a.t == b.t);
    let n = reports.len();
    let gap: Vec<bool> = (0..n).map(|i| i > 0 && reports[i].t - reports[i - 1].t > gap_s).collect();
    // The run of reports each one is in, gap to gap.
    let mut run = vec![0usize; n];
    for i in 1..n {
        run[i] = run[i - 1] + usize::from(gap[i]);
    }
    let window = |i: usize, span: f64| -> Vec<usize> {
        let mut out = Vec::new();
        let mut j = i;
        while j > 0 && run[j - 1] == run[i] && reports[i].t - reports[j - 1].t <= span {
            j -= 1;
        }
        while j < n && run[j] == run[i] && reports[j].t - reports[i].t <= span {
            out.push(j);
            j += 1;
        }
        out
    };
    let held = held(&reports, &run);
    // The good heights at or before each report in its run, within `span`.
    let behind = |i: usize, span: f64| {
        let (reports, run, held) = (&reports, &run, &held);
        (0..=i).rev().take_while(move |&j| run[j] == run[i] && reports[i].t - reports[j].t <= span).filter(move |&j| !held[j])
    };
    let mut last_good: Option<f64> = None;
    let alt: Vec<Option<f64>> = (0..n)
        .map(|i| {
            if i > 0 && run[i - 1] != run[i] {
                last_good = None;
            }
            reports[i].alt_ft?;
            if held[i] {
                // Carried forward, never null (a null read as 0 puts the airplane on the ground).
                return last_good.or(reports[i].alt_ft);
            }
            // On a line through the heights before it at its own time: a
            // mean leans back toward where a climb came from.
            let h = line_at(behind(i, SMOOTH_ALT_S).filter_map(|j| Some((reports[j].t, reports[j].alt_ft?))), reports[i].t);
            last_good = h.or(last_good);
            h
        })
        .collect();
    // The position each report's own time has on a straight line fitted
    // through those within SMOOTH_POS_S (least squares): a plain mean is
    // the position at the reports' mean time, which, where they come
    // unevenly, puts a report behind or ahead of where it was and makes a
    // steady airplane surge (the simulator export's 10 frames a second
    // showed 300 kt read as 26 to 419, 2026-11-12).
    let pos: Vec<(f64, f64)> = (0..n)
        .map(|i| {
            let w = window(i, SMOOTH_POS_S);
            let lat = line_at(w.iter().map(|&j| (reports[j].t, reports[j].lat)), reports[i].t).unwrap_or(reports[i].lat);
            let lon = line_at(w.iter().map(|&j| (reports[j].t, reports[j].lon)), reports[i].t).unwrap_or(reports[i].lon);
            (lat, lon)
        })
        .collect();
    let mut along = 0.0;
    (0..n)
        .map(|i| {
            if i > 0 {
                along += geo::distance_nm(pos[i - 1].0, pos[i - 1].1, pos[i].0, pos[i].1);
            }
            let r = &reports[i];
            // The neighbours in its run, for what was not sent.
            let before = (i > 0 && run[i - 1] == run[i]).then(|| i - 1);
            let after = (i + 1 < n && run[i + 1] == run[i]).then_some(i + 1);
            let (a, b) = (before.unwrap_or(i), after.unwrap_or(i));
            let dt = reports[b].t - reports[a].t;
            let gs = r.gs_kt.or_else(|| (dt > 0.0).then(|| geo::distance_nm(pos[a].0, pos[a].1, pos[b].0, pos[b].1) / dt * 3600.0));
            let track =
                r.track_deg.or_else(|| (a != b && pos[a] != pos[b]).then(|| geo::bearing_deg(pos[a].0, pos[a].1, pos[b].0, pos[b].1)));
            Sample {
                t: r.t,
                lat: pos[i].0,
                lon: pos[i].1,
                alt_ft: alt[i],
                alt_held: held[i] && r.alt_ft.is_some(),
                gs_kt: gs,
                track_deg: track,
                vs_fpm: vertical_speed(&reports, &run, &held, i),
                along_nm: along,
                gap: gap[i],
                ground: r.ground,
            }
        })
        .collect()
}

/// Whether each report's pressure altitude is held (the module's head):
/// the caller's `alt_held` where given, else unchanged through its run for
/// up to HELD_SPAN_S while the GNSS height spread, or the rate sent added
/// up, more than HELD_FT.
fn held(reports: &[Report], run: &[usize]) -> Vec<bool> {
    (0..reports.len())
        .map(|i| {
            if let Some(said) = reports[i].alt_held {
                return said;
            }
            let Some(a) = reports[i].alt_ft else { return false };
            let mut j = i;
            while j > 0 && run[j - 1] == run[i] && reports[j - 1].alt_ft == Some(a) && reports[i].t - reports[j - 1].t <= HELD_SPAN_S {
                j -= 1;
            }
            let geom: Vec<f64> = reports[j..=i].iter().filter_map(|r| r.alt_geom_ft).collect();
            let spread = geom.iter().copied().fold(f64::NEG_INFINITY, f64::max) - geom.iter().copied().fold(f64::INFINITY, f64::min);
            let by_rate: f64 = (j + 1..=i)
                .filter_map(|k| Some(reports[k].geom_rate_fpm.or(reports[k].baro_rate_fpm)? * (reports[k].t - reports[k - 1].t) / 60.0))
                .sum();
            (geom.len() > 1 && spread > HELD_FT) || by_rate.abs() > HELD_FT
        })
        .collect()
}

/// The climb or descent at report `i`, ft/min: the rate it sent (readsb's
/// baro rate, else its GNSS one; the GNSS one alone where the pressure
/// altitude is held); else the slope of a straight line fitted (least
/// squares) through the good heights in the VS_SPAN_S before it in its
/// run, which reads a steady climb's rate through the 25 ft steps; with
/// none other in that span, the report before it in its run; None where
/// it has no height or nothing before it to read a change from -- never
/// a report still to come.
fn vertical_speed(reports: &[Report], run: &[usize], held: &[bool], i: usize) -> Option<f64> {
    let r = &reports[i];
    r.alt_ft?;
    if held[i] {
        return r.geom_rate_fpm;
    }
    if let Some(sent) = r.baro_rate_fpm.or(r.geom_rate_fpm) {
        return Some(sent);
    }
    // The good heights before it in its run, as (s from report i, ft).
    let heights = || {
        (0..=i).rev().take_while(|&j| run[j] == run[i]).filter(|&j| !held[j]).filter_map(|j| Some((reports[j].t - r.t, reports[j].alt_ft?)))
    };
    let mut near: Vec<(f64, f64)> = heights().take_while(|p| p.0 >= -VS_SPAN_S).collect();
    // Level in cruise readsb keeps a point only every 20 s or so, wider
    // than the span: there the report before it is read, which the run
    // holds within GAP_S, rather than no climb at all.
    if near.len() < 2 {
        near.extend(heights().find(|p| p.0 < -VS_SPAN_S));
    }
    if near.len() < 2 {
        return None;
    }
    let count = near.len() as f64;
    let (mt, ma) = (near.iter().map(|p| p.0).sum::<f64>() / count, near.iter().map(|p| p.1).sum::<f64>() / count);
    let spread: f64 = near.iter().map(|p| (p.0 - mt) * (p.0 - mt)).sum();
    let together: f64 = near.iter().map(|p| (p.0 - mt) * (p.1 - ma)).sum();
    (spread > 0.0).then(|| together / spread * 60.0)
}

/// The value at `t` of the straight line fitted (least squares) through
/// the (time, value) pairs; their mean where they share one time; None
/// with none.
fn line_at(pairs: impl Iterator<Item = (f64, f64)>, t: f64) -> Option<f64> {
    let pairs: Vec<(f64, f64)> = pairs.collect();
    let count = pairs.len() as f64;
    let (mt, mv) = (mean(pairs.iter().map(|p| p.0))?, mean(pairs.iter().map(|p| p.1))?);
    let spread: f64 = pairs.iter().map(|p| (p.0 - mt) * (p.0 - mt)).sum();
    let together: f64 = pairs.iter().map(|p| (p.0 - mt) * (p.1 - mv)).sum();
    Some(if spread > 0.0 && count > 1.0 { mv + together / spread * (t - mt) } else { mv })
}

fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, count) = values.fold((0.0, 0usize), |(s, c), v| (s + v, c + 1));
    (count > 0).then(|| sum / count as f64)
}

fn report(v: &Value) -> Result<Report, String> {
    const NAME: &str = "replay_track";
    Ok(Report {
        t: num(NAME, v, "t")?,
        lat: num(NAME, v, "lat")?,
        lon: num(NAME, v, "lon")?,
        alt_ft: opt(NAME, v, "alt_ft")?,
        gs_kt: opt(NAME, v, "gs_kt")?,
        track_deg: opt(NAME, v, "track_deg")?,
        ground: opt_bool(NAME, v, "ground")?.unwrap_or(false),
        baro_rate_fpm: opt(NAME, v, "baro_rate_fpm")?,
        geom_rate_fpm: opt(NAME, v, "geom_rate_fpm")?,
        alt_geom_ft: opt(NAME, v, "alt_geom_ft")?,
        alt_held: opt_bool(NAME, v, "alt_held")?,
    })
}

/// `replay_track`: `{"points": [Sample], "gaps": [{"from", "to"}],
/// "length_nm"}` from `{"points": [Report], "gap_s"?}`.
pub(super) fn replay_rule(v: &Value) -> Result<String, String> {
    let points = v.get("points").and_then(Value::as_array).ok_or("replay_track: \"points\" is missing or not a list")?;
    let gap_s = match opt("replay_track", v, "gap_s")? {
        None => GAP_S,
        Some(s) if s > 0.0 => s,
        Some(_) => return Err("replay_track: \"gap_s\" is more than 0".to_owned()),
    };
    let samples = condition(points.iter().map(report).collect::<Result<_, _>>()?, gap_s);
    let mut out = String::from("{\"points\":[");
    for (i, s) in samples.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"t\":");
        json::number(&mut out, s.t);
        out.push_str(",\"lat\":");
        json::number(&mut out, s.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, s.lon);
        out.push_str(",\"alt_ft\":");
        json::opt_number(&mut out, s.alt_ft);
        out.push_str(if s.alt_held { ",\"alt_held\":true" } else { ",\"alt_held\":false" });
        out.push_str(",\"gs_kt\":");
        json::opt_number(&mut out, s.gs_kt);
        out.push_str(",\"track_deg\":");
        json::opt_number(&mut out, s.track_deg);
        out.push_str(",\"vs_fpm\":");
        json::opt_number(&mut out, s.vs_fpm);
        out.push_str(",\"along_nm\":");
        json::number(&mut out, s.along_nm);
        out.push_str(if s.gap { ",\"gap\":true" } else { ",\"gap\":false" });
        out.push_str(if s.ground { ",\"ground\":true}" } else { ",\"ground\":false}" });
    }
    out.push_str("],\"gaps\":[");
    let mut first = true;
    for w in samples.windows(2).filter(|w| w[1].gap) {
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str("{\"from\":");
        json::number(&mut out, w[0].t);
        out.push_str(",\"to\":");
        json::number(&mut out, w[1].t);
        out.push('}');
    }
    out.push_str("],\"length_nm\":");
    json::number(&mut out, samples.last().map_or(0.0, |s| s.along_nm));
    out.push('}');
    Ok(out)
}

#[cfg(test)]
#[path = "replay_tests.rs"]
mod tests;
