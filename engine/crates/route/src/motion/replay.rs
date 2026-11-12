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
//! - The height is smoothed over SMOOTH_ALT_S each side, on a straight
//!   line fitted through the heights at the report's own time: a transponder's
//!   pressure altitude comes in 25 ft steps (DO-260B, the barometric
//!   altitude's 25 ft quantum), which a point-to-point climb rate reads as
//!   bursts of thousands of feet a minute.
//! - The vertical speed is the slope of the heights reported within
//!   VS_SPAN_S each side, as a VSI's own lag averages it (FAA-H-8083-15B,
//!   Ch. 5, the vertical speed indicator: "trend" then "rate" after 6 to
//!   9 s).

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
/// The vertical speed is read from the heights within this each side, s.
pub const VS_SPAN_S: f64 = 15.0;

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
}

/// One report made ready.
#[derive(Clone, Debug, PartialEq)]
pub struct Sample {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
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
    let alt: Vec<Option<f64>> = (0..n)
        .map(|i| {
            reports[i].alt_ft?;
            // On a line through them at its own time, as the position
            // below: a mean leans toward the level a climb is heading for
            // at a run's ends (250 ft high at N14511's first report).
            line_at(window(i, SMOOTH_ALT_S).iter().filter_map(|&j| Some((reports[j].t, reports[j].alt_ft?))), reports[i].t)
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
                gs_kt: gs,
                track_deg: track,
                vs_fpm: vertical_speed(&reports, &run, i),
                along_nm: along,
                gap: gap[i],
                ground: r.ground,
            }
        })
        .collect()
}

/// The climb or descent at report `i`, ft/min: the slope of a straight
/// line fitted (least squares) through the heights reported within
/// VS_SPAN_S each side in its run, which reads a steady climb's rate
/// through the 25 ft steps even at a run's ends; None where it has no
/// height or no neighbour to read a change from.
fn vertical_speed(reports: &[Report], run: &[usize], i: usize) -> Option<f64> {
    reports[i].alt_ft?;
    let near: Vec<(f64, f64)> = reports
        .iter()
        .zip(run)
        .filter(|(r, k)| **k == run[i] && (r.t - reports[i].t).abs() <= VS_SPAN_S)
        .filter_map(|(r, _)| Some((r.t - reports[i].t, r.alt_ft?)))
        .collect();
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
mod tests {
    use super::*;

    fn at(t: f64, alt: Option<f64>) -> Report {
        Report { t, lat: 45.0 + t * 0.0005, lon: -93.0, alt_ft: alt, gs_kt: None, track_deg: None, ground: alt.is_none() }
    }

    #[test]
    fn a_minute_unheard_is_a_gap_and_nothing_is_smoothed_across_it() {
        let mut reports: Vec<Report> = (0..5).map(|i| at(i as f64 * 10.0, Some(3000.0))).collect();
        reports.extend((0..5).map(|i| at(200.0 + i as f64 * 10.0, Some(5000.0))));
        let s = condition(reports, GAP_S);
        assert!(s[5].gap && !s[4].gap && !s[0].gap);
        assert_eq!(s[4].alt_ft, Some(3000.0));
        assert_eq!(s[5].alt_ft, Some(5000.0));
        // No climb read across the hole either.
        assert_eq!(s[5].vs_fpm, Some(0.0));
    }

    #[test]
    fn a_steady_climb_reads_as_its_rate_through_the_25_ft_steps() {
        // 500 ft/min, reported every 5 s in 25 ft steps.
        let reports: Vec<Report> =
            (0..40).map(|i| at(i as f64 * 5.0, Some(((2000.0 + i as f64 * 5.0 * 500.0 / 60.0) / 25.0).round() * 25.0))).collect();
        let s = condition(reports, GAP_S);
        let vs = s[20].vs_fpm.unwrap();
        assert!((vs - 500.0).abs() < 40.0, "{vs}");
    }

    #[test]
    fn out_of_order_and_repeated_reports_are_put_in_order_once() {
        let s = condition(vec![at(20.0, Some(1000.0)), at(0.0, Some(1000.0)), at(20.0, Some(1000.0)), at(10.0, None)], GAP_S);
        assert_eq!(s.iter().map(|x| x.t).collect::<Vec<_>>(), vec![0.0, 10.0, 20.0]);
        assert!(s[1].ground && s[1].alt_ft.is_none());
    }

    #[test]
    fn a_climb_from_a_runs_start_is_not_lifted_toward_where_it_is_going() {
        // 3,000 ft/min from 125 ft, a report a second, in 25 ft steps.
        let reports: Vec<Report> = (0..30).map(|i| at(i as f64, Some(((125.0 + i as f64 * 50.0) / 25.0).round() * 25.0))).collect();
        let s = condition(reports, GAP_S);
        let first = s[0].alt_ft.unwrap();
        assert!((first - 125.0).abs() < 15.0, "{first}");
    }

    #[test]
    fn uneven_reports_keep_their_own_place_on_a_steady_line() {
        // Due north at a steady 0.0005 degrees a second, reported at 0,
        // 0.4, 1.6 and 3 s: each keeps the latitude of its own time.
        let s = condition(vec![at(0.0, Some(1000.0)), at(0.4, Some(1000.0)), at(1.6, Some(1000.0)), at(3.0, Some(1000.0))], GAP_S);
        for x in &s {
            assert!((x.lat - (45.0 + x.t * 0.0005)).abs() < 1e-9, "{} {}", x.t, x.lat);
        }
    }

    #[test]
    fn ground_speed_and_track_are_worked_out_where_not_sent() {
        let s = condition(vec![at(0.0, Some(1000.0)), at(60.0, Some(1000.0)), at(120.0, Some(1000.0))], 100.0);
        // 0.03 degrees of latitude a minute is 1.8 nm, 108 kt, due north.
        let gs = s[1].gs_kt.unwrap();
        assert!((gs - 108.0).abs() < 1.0, "{gs}");
        assert!(s[1].track_deg.unwrap().abs() < 0.5);
        assert!((s[2].along_nm - 3.6).abs() < 0.05);
    }
}
