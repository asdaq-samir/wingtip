//! A METAR's variable wind direction, "27015G25KT 230V310": the wind may
//! blow from anywhere between the two bounds, clockwise from the first
//! (FMH-1 chapter 12, the wind group; AIM 7-1-28's METAR key, "dddVddd").
//! The runways' crosswind and tailwind are judged at the worst direction
//! in that arc, the mean's included, so a wind down the runway on the mean
//! but 40 degrees off at one bound is not read as none across. The end a
//! wind favours is still picked on the mean (wind::favoured_end).

use super::wind::{crosswind_kt, headwind_kt, js_normalize};

/// Whether `d` lies in the arc from `from` clockwise to `to`, all true.
fn within((from, to): (f64, f64), d: f64) -> bool {
    js_normalize(d - from) <= js_normalize(to - from)
}

/// The directions the wind is judged at on a heading: the mean, and with a
/// variable arc its bounds and any direction inside it straight across or
/// straight behind the heading, where the components are at their worst.
fn directions(dir: f64, variable: Option<(f64, f64)>, heading: f64) -> Vec<f64> {
    let mut out = vec![dir];
    if let Some(arc) = variable {
        out.extend([arc.0, arc.1]);
        out.extend([heading + 90.0, heading - 90.0, heading + 180.0].into_iter().filter(|d| within(arc, *d)));
    }
    out
}

/// The crosswind at its worst over the arc, signed (positive from the
/// right), the first of equals; the mean's with no arc.
pub fn worst_crosswind_kt(dir: f64, variable: Option<(f64, f64)>, kt: f64, heading: f64) -> f64 {
    directions(dir, variable, heading)
        .into_iter()
        .map(|d| crosswind_kt(d, kt, heading))
        .fold(None, |best: Option<f64>, x| Some(best.map_or(x, |b| if x.abs() > b.abs() { x } else { b })))
        .unwrap_or(0.0)
}

/// The headwind at its least over the arc: a tailwind (negative) where
/// any direction in it is from behind; the mean's with no arc.
pub fn worst_headwind_kt(dir: f64, variable: Option<(f64, f64)>, kt: f64, heading: f64) -> f64 {
    directions(dir, variable, heading).into_iter().map(|d| headwind_kt(d, kt, heading)).fold(f64::INFINITY, f64::min)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wind_down_the_runway_on_its_mean_is_judged_across_at_its_bound() {
        // 27015G25KT 230V310 on runway 27 (270 true): 0 kt across on the
        // mean, 25 sin 40 = 16.07 kt in the gusts at 310 (round 6's audit).
        assert!(worst_crosswind_kt(270.0, None, 25.0, 270.0).abs() < 1e-9);
        let gust = worst_crosswind_kt(270.0, Some((230.0, 310.0)), 25.0, 270.0);
        assert!((gust.abs() - 25.0 * 40f64.to_radians().sin()).abs() < 1e-9, "{gust}");
        // Inside the arc the headwind is least at a bound: 15 cos 40.
        let head = worst_headwind_kt(270.0, Some((230.0, 310.0)), 15.0, 270.0);
        assert!((head - 15.0 * 40f64.to_radians().cos()).abs() < 1e-9, "{head}");
    }

    #[test]
    fn an_arc_that_takes_in_the_beam_or_the_tail_is_all_across_or_all_behind() {
        // 180V300 on 270 takes in 180, straight across: all 10 kt.
        assert!((worst_crosswind_kt(240.0, Some((180.0, 300.0)), 10.0, 270.0).abs() - 10.0).abs() < 1e-9);
        // 030V130 on 270 takes in 090, straight behind: a 10 kt tailwind.
        assert!((worst_headwind_kt(80.0, Some((30.0, 130.0)), 10.0, 270.0) + 10.0).abs() < 1e-9);
        // An arc over north, 330V030, on runway 36 (360): its bounds, 30 off.
        let x = worst_crosswind_kt(0.0, Some((330.0, 30.0)), 10.0, 360.0);
        assert!((x.abs() - 5.0).abs() < 1e-9, "{x}");
        assert!(within((330.0, 30.0), 0.0) && !within((330.0, 30.0), 90.0));
    }
}
