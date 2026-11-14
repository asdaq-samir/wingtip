//! A field's wind as the map marks it (the owner's pick, 2026-11-10: the
//! airport weather marks): the least crosswind its runways leave a pilot,
//! whether the wind earns an arrow and whether that arrow is a warning,
//! and the station model's barb for the wind. One copy for the planner
//! (which works the least crosswind out for each field in view), the web's
//! map and the phones' maps.
//!
//! - `least_crosswind`: of a field's runways, each judged on the end the
//!   wind favours (wind::favoured_end), the one whose crosswind, steady or
//!   in the gusts (wind::steady_or_gust_kt), is least: the runway a pilot
//!   would pick to keep the wind as nearly down it as the field allows.
//! - `wind_arrow`: an arrow at 10 kt or more or in a gusting wind, red only
//!   where that least crosswind is more than the airplane's demonstrated
//!   crosswind; never red with no airplane or no figure for it.
//! - `wind_barb`: the station model's flags, barbs and half-barbs.
//!
//! A caution, never a limit (the owner, 2026-10-23: warn, never limit).

use super::calls::{end_headings, reported};
use super::wind::{favoured_end, steady_or_gust_kt, Reported};
use crate::gonogo::calls::In;
use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// A runway's ends, (ident, true heading), either None.
pub type Ends = Vec<(Option<String>, Option<f64>)>;

/// The least crosswind a field's runways leave in a wind: the end it is
/// on (None for a variable wind, which favours none) and the knots,
/// steady or gust, whichever is more, unrounded: the map's arrow turns red
/// on it against the demonstrated crosswind, and a 10.4 kt crosswind
/// rounded to 10 would never pass a 10 kt figure (the aviation audit's
/// AV-10, as the Go/No-Go judges it, runway_crosswind_judged_kt).
#[derive(Clone, Debug, PartialEq)]
pub struct LeastCrosswind {
    pub end: Option<String>,
    pub crosswind_kt: f64,
}

/// The least crosswind of `runways` in the wind `report`, at a field whose
/// magnetic variation is `variation_deg` (east positive). Calm is none
/// across, on no end in particular. A variable wind (VRB, sent with no
/// direction, AIM 7-1-28) may blow straight across any runway, so all of
/// it, gusts included, is taken as crosswind, as runway_end_fit takes it
/// (the aviation check, 2026-10-27): the simplification errs toward the
/// stronger crosswind. None with no wind reported, or no runway end with
/// a heading to judge it on.
pub fn least_crosswind(runways: &[Ends], report: &Reported, variation_deg: f64) -> Option<LeastCrosswind> {
    let speed = report.speed_kt?;
    let headed =
        |ends: &Ends| ends.iter().any(|(ident, h)| super::wind::end_heading_true_deg(ident.as_deref(), *h, variation_deg).is_some());
    if !runways.iter().any(headed) {
        return None;
    }
    if speed == 0.0 {
        return Some(LeastCrosswind { end: None, crosswind_kt: 0.0 });
    }
    if report.dir_true_deg.is_none() {
        let gust = report.gust_kt.filter(|g| *g > speed);
        return Some(LeastCrosswind { end: None, crosswind_kt: steady_or_gust_kt(speed, gust) });
    }
    let mut best: Option<LeastCrosswind> = None;
    for ends in runways {
        let Some(f) = favoured_end(ends, Some(report), variation_deg, None) else { continue };
        // The unrounded crosswind, steady or gust whichever is more
        // (favoured_end's crosswind_exact_kt), not the whole knots the
        // runway's wind is written in.
        let kt = f.crosswind_exact_kt;
        // The first runway listed keeps a tie: the data's order, the same
        // answer on every host.
        if best.as_ref().is_none_or(|b| kt < b.crosswind_kt) {
            best = Some(LeastCrosswind { end: f.end, crosswind_kt: kt });
        }
    }
    best
}

/// The wind that earns an arrow on the map: 10 kt or more, or a gust
/// reported over the steady wind. The 10 kt is the owner's pick
/// (2026-11-10, the airport weather marks), a design choice and no FAA
/// figure: below it a light airplane's pilot seldom needs the wind pointed
/// out, and a gust at any speed is worth a look.
pub const ARROW_FROM_KT: f64 = 10.0;

/// Whether a wind earns its arrow, and whether the arrow warns: shown at
/// ARROW_FROM_KT or more or gusting; `over` where the least crosswind
/// (least_crosswind) is more than the airplane's maximum demonstrated
/// crosswind. That figure is the POH's: 14 CFR 23.233(a) (before
/// amendment 23-64, 2016) had each airplane establish "a 90 degree
/// cross-component of wind velocity, demonstrated to be safe for taxiing,
/// takeoff, and landing", of at least 0.2 VSO, and the AFM states it. It
/// is what was shown at certification, not a limit, so more is a caution.
/// No airplane picked, or none of that figure in its profile, is never
/// over: nothing assumes an airplane (the owner, 2026-11-09).
pub fn wind_arrow(speed_kt: Option<f64>, gust_kt: Option<f64>, crosswind_kt: Option<f64>, demonstrated_kt: Option<f64>) -> (bool, bool) {
    let speed = speed_kt.unwrap_or(0.0);
    let gusting = gust_kt.is_some_and(|g| g > speed);
    let shown = speed >= ARROW_FROM_KT || gusting;
    let over = shown && matches!((crosswind_kt, demonstrated_kt), (Some(c), Some(d)) if c > d);
    (shown, over)
}

/// A station model's wind barb: FAA-H-8083-28B, Aviation Weather Handbook,
/// 25.2.3.4.5: "Wind is plotted in increments of 5 kt ... Wind speed is
/// determined by adding the values of the flags (50 kt), barbs (10 kt),
/// and half-barbs (5 kt) found on the stem. If the wind is calm at the time
/// of observation, only a single circle over the station is depicted."
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Barb {
    pub calm: bool,
    pub flags: u32,
    pub barbs: u32,
    pub half_barbs: u32,
}

/// Below this a wind is drawn calm, the circle with no stem: the NWS's
/// table of station plots (weather.gov/hfo/windbarbinfo, "Wind Barbs")
/// rounds an observed 0-2 kt to 0 kt and draws 3-7 kt as the 5 kt
/// half-barb; an ASOS reports under 3 kt as calm (AIM 7-1-28's 00000KT)
/// all the same, so the circle is what the station itself would say.
pub const CALM_BELOW_KT: f64 = 3.0;

/// The barb for a wind of `speed_kt`, to the nearest 5 kt (a half to the
/// greater), as the NWS's table rounds it (weather.gov/hfo/windbarbinfo:
/// "rounded to the nearest 5 knots"; 3-7 kt is 5, 8-12 is 10, 48-52 is
/// 50); under CALM_BELOW_KT the calm circle.
pub fn wind_barb(speed_kt: f64) -> Barb {
    if speed_kt < CALM_BELOW_KT {
        return Barb { calm: true, flags: 0, barbs: 0, half_barbs: 0 };
    }
    let fives = (speed_kt / 5.0 + 0.5).floor() as u32;
    Barb { calm: false, flags: fives / 10, barbs: (fives % 10) / 2, half_barbs: fives % 2 }
}

/// The rules by name, as their contract files (crates/brief/contract) name
/// them to the dispatcher.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    match name {
        "least_crosswind" => {
            let runways = i.list(v, "runways")?.iter().map(|r| end_headings(i, r, "end_headings")).collect::<R<Vec<_>>>()?;
            let Some(report) = reported(i, v, "metar")? else { return Ok("null".to_owned()) };
            Ok(match least_crosswind(&runways, &report, i.num(v, "variation_deg")?) {
                None => "null".to_owned(),
                Some(l) => {
                    let mut out = String::from("{\"end\":");
                    json::opt_string(&mut out, l.end.as_deref());
                    // Unrounded, to a millionth of a knot: far below any
                    // figure it is held against, and the same on every host
                    // whatever the last bit its sine came out at. Written as
                    // the planner's ints are where whole ("15", not "15.0").
                    out.push_str(",\"crosswind_kt\":");
                    let kt = (l.crosswind_kt * 1e6).round() / 1e6;
                    if kt.fract() == 0.0 && kt.abs() < 1e15 {
                        out.push_str(&format!("{}", kt as i64));
                    } else {
                        json::number(&mut out, kt);
                    }
                    out.push('}');
                    out
                }
            })
        }
        "wind_arrow" => {
            let (shown, over) = wind_arrow(
                i.opt_num(v, "speed_kt")?,
                i.opt_num(v, "gust_kt")?,
                i.opt_num(v, "crosswind_kt")?,
                i.opt_num(v, "demonstrated_kt")?,
            );
            Ok(format!("{{\"shown\":{shown},\"over\":{over}}}"))
        }
        "wind_barb" => {
            let b = wind_barb(i.num(v, "speed_kt")?);
            Ok(format!("{{\"calm\":{},\"flags\":{},\"barbs\":{},\"half_barbs\":{}}}", b.calm, b.flags, b.barbs, b.half_barbs))
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wind(dir: Option<f64>, kt: f64, gust: Option<f64>) -> Reported {
        Reported { dir_true_deg: dir, speed_kt: Some(kt), gust_kt: gust }
    }

    fn rwy(a: &str, ha: f64, b: &str, hb: f64) -> Ends {
        vec![(Some(a.into()), Some(ha)), (Some(b.into()), Some(hb))]
    }

    #[test]
    fn the_runway_most_nearly_along_the_wind_leaves_the_least() {
        // 220 at 18 gusting 26 at a field with 18/36 and 27/09 (true): on
        // 18 the wind is 40 degrees off, 18 sin 40 = 11.6, the gust's
        // 26 sin 40 = 16.71; on 27 it is 50 off, more.
        let runways = [rwy("18", 180.0, "36", 360.0), rwy("27", 270.0, "09", 90.0)];
        let l = least_crosswind(&runways, &wind(Some(220.0), 18.0, Some(26.0)), 0.0).unwrap();
        assert_eq!(l.end.as_deref(), Some("18"));
        assert!((l.crosswind_kt - 26.0 * 40f64.to_radians().sin()).abs() < 1e-9);
    }

    #[test]
    fn a_crosswind_just_past_the_demonstrated_turns_the_arrow_red() {
        // 270 at 10.4 straight across 18/36: 10.4 kt, which whole knots
        // would read 10 and never past a 10 kt demonstrated crosswind
        // (the aviation audit's AV-10).
        let l = least_crosswind(&[rwy("18", 180.0, "36", 360.0)], &wind(Some(270.0), 10.4, None), 0.0).unwrap();
        assert!((l.crosswind_kt - 10.4).abs() < 1e-9);
        assert_eq!(wind_arrow(Some(10.4), None, Some(l.crosswind_kt), Some(10.0)), (true, true));
        let calm_side = least_crosswind(&[rwy("18", 180.0, "36", 360.0)], &wind(Some(270.0), 9.6, None), 0.0).unwrap();
        assert_eq!(wind_arrow(Some(10.0), None, Some(calm_side.crosswind_kt), Some(10.0)), (true, false));
    }

    #[test]
    fn a_variable_wind_is_all_crosswind_and_calm_none() {
        let runways = [rwy("18", 180.0, "36", 360.0)];
        assert_eq!(least_crosswind(&runways, &wind(None, 6.0, Some(15.0)), 0.0).unwrap().crosswind_kt, 15.0);
        assert_eq!(least_crosswind(&runways, &wind(Some(0.0), 0.0, None), 0.0).unwrap().crosswind_kt, 0.0);
        assert_eq!(least_crosswind(&[], &wind(Some(220.0), 18.0, None), 0.0), None);
    }

    #[test]
    fn the_arrow_from_ten_knots_or_a_gust() {
        assert_eq!(wind_arrow(Some(9.0), None, Some(9.0), Some(5.0)), (false, false));
        assert_eq!(wind_arrow(Some(10.0), None, None, None), (true, false));
        assert_eq!(wind_arrow(Some(6.0), Some(16.0), None, None), (true, false));
        // A gust no more than the steady wind is no gust.
        assert_eq!(wind_arrow(Some(6.0), Some(6.0), None, None), (false, false));
    }

    #[test]
    fn red_only_past_the_demonstrated_crosswind_of_a_picked_airplane() {
        assert_eq!(wind_arrow(Some(18.0), Some(26.0), Some(17.0), Some(15.0)), (true, true));
        assert_eq!(wind_arrow(Some(18.0), Some(26.0), Some(15.0), Some(15.0)), (true, false));
        assert_eq!(wind_arrow(Some(18.0), Some(26.0), Some(17.0), None), (true, false));
    }

    #[test]
    fn barbs_add_to_the_wind_in_fives() {
        assert_eq!(wind_barb(0.0), Barb { calm: true, flags: 0, barbs: 0, half_barbs: 0 });
        // The NWS table's edges: 0-2 kt is 0 (calm), 3-7 is 5, 8-12 is 10,
        // 48-52 is a flag.
        assert_eq!(wind_barb(2.0), Barb { calm: true, flags: 0, barbs: 0, half_barbs: 0 });
        assert_eq!(wind_barb(3.0), Barb { calm: false, flags: 0, barbs: 0, half_barbs: 1 });
        assert_eq!(wind_barb(7.0), Barb { calm: false, flags: 0, barbs: 0, half_barbs: 1 });
        assert_eq!(wind_barb(8.0), Barb { calm: false, flags: 0, barbs: 1, half_barbs: 0 });
        assert_eq!(wind_barb(47.0), Barb { calm: false, flags: 0, barbs: 4, half_barbs: 1 });
        assert_eq!(wind_barb(48.0), Barb { calm: false, flags: 1, barbs: 0, half_barbs: 0 });
        assert_eq!(wind_barb(15.0), Barb { calm: false, flags: 0, barbs: 1, half_barbs: 1 });
        assert_eq!(wind_barb(12.0), Barb { calm: false, flags: 0, barbs: 1, half_barbs: 0 });
        assert_eq!(wind_barb(13.0), Barb { calm: false, flags: 0, barbs: 1, half_barbs: 1 });
        assert_eq!(wind_barb(65.0), Barb { calm: false, flags: 1, barbs: 1, half_barbs: 1 });
    }
}
