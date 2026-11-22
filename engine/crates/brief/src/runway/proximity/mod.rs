//! The runway proximity advisor: where own ship is against a field's
//! runways -- on one, coming up to one's holding position on the ground,
//! or lined up with one below the traffic pattern -- and the hot spot it
//! is nearing, for the own-ship airport diagram and its spoken words
//! (wingtip-wording's `runway_proximity` says it).
//!
//! It is the FAA's taxi guidance turned into a prompt, not a clearance and
//! not a surface surveillance system:
//!
//! - AC 120-74B 7e(2)(d): "When approaching any hold short line, verbalize
//!   'approaching (specific runway number) hold short line'"; AIM 2-3-5 a:
//!   runway holding position markings "indicate where aircraft MUST STOP
//!   when approaching a runway". The signs and markings, and ATC's
//!   instructions, rule; the advisor only reminds.
//! - AC 150/5300-13B Appendix A, 49: a hot spot is "a location on an
//!   airport movement area with a history of potential risk of a collision
//!   or runway incursion"; AC 120-74B 7b asks the crew to know them before
//!   taxi, and the FAA's runway safety card (Pilot Procedures During Taxi
//!   Operations, March 2026) to "identify complex intersections and hot
//!   spots".
//! - AC 120-76D 11.17.1: on the ground "use of external visual references
//!   is sufficient for maneuvering", and in the air the installed displays
//!   are the reference; 11.17.2.3 and 11.17.2.4: a fix older than 3 s or
//!   coarser than 30 m is not used.
//!
//! It runs only on the ground and in the pattern: below the field's
//! traffic pattern altitude (AC 90-66C's 1,000 ft above the field where
//! none is published, pick::PATTERN_AGL_FT). Above it, it says nothing.

pub mod figures;
mod line;
pub mod read;

use super::pick::{runway_number, PATTERN_AGL_FT};
use figures::*;
use line::{ft, line, Line};
use wingtip_core::flat::Flat;
use wingtip_core::geo::{angle_between, py_mod};
use wingtip_core::units::FT_PER_NM;

/// One end of a runway: its ident ("27") and where its threshold is.
#[derive(Clone, Debug, PartialEq)]
pub struct End {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
}

/// A runway as NASR has it: its two ends' places, its width and whether
/// it is closed (a closed runway is still one to stay off).
#[derive(Clone, Debug, PartialEq)]
pub struct Strip {
    pub ends: [End; 2],
    pub width_ft: Option<f64>,
    pub closed: bool,
}

/// A hot spot placed on the ground ("HS 1"), from the diagram's own label.
#[derive(Clone, Debug, PartialEq)]
pub struct HotSpot {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
}

/// Own ship: its fix, its age and accuracy, and its motion where known.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Fix {
    pub lat: f64,
    pub lon: f64,
    pub age_s: f64,
    pub accuracy_m: f64,
    pub track_deg: Option<f64>,
    pub groundspeed_kt: Option<f64>,
    /// GNSS altitude, ft MSL.
    pub altitude_ft: Option<f64>,
}

/// The field: its elevation and its pattern's height above it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Field {
    pub elevation_ft: Option<f64>,
    pub pattern_agl_ft: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    /// The fix is too old or too coarse (AC 120-76D 11.17.2.3/4).
    NoFix,
    /// Above the pattern: the advisor is quiet.
    Above,
    /// On a runway, on the surface.
    OnRunway,
    /// Closing on a runway's holding position on the surface.
    Approaching,
    /// Lined up with a runway in the air, below the pattern.
    LinedUp,
    /// Near no runway.
    Clear,
}

/// What the advisor finds.
#[derive(Clone, Debug, PartialEq)]
pub struct Proximity {
    pub state: State,
    /// The runway (an index into the strips) and, where the track says
    /// it, the end whose runway it is ("27" rolling west on 9/27).
    pub runway: Option<usize>,
    pub end: Option<usize>,
    /// Approaching: the end whose threshold is on the left as own ship
    /// tracks, as the holding position sign sets them (AIM 2-3-8 b 1:
    /// "15-33" has runway 15's threshold to the left).
    pub left_end: Option<usize>,
    /// To the assumed holding position, ft, 0 at or past it (surface).
    pub hold_short_ft: Option<f64>,
    /// To the threshold ahead, ft (lined up).
    pub threshold_ft: Option<f64>,
    /// The nearest hot spot within HOT_SPOT_FT (an index) and how far, ft.
    pub hot_spot: Option<(usize, f64)>,
}

impl Proximity {
    fn quiet(state: State) -> Proximity {
        Proximity { state, runway: None, end: None, left_end: None, hold_short_ft: None, threshold_ft: None, hot_spot: None }
    }
}

/// The advisor: own ship against the field's runways and hot spots.
pub fn proximity(fix: &Fix, field: &Field, strips: &[Strip], spots: &[HotSpot]) -> Proximity {
    if !(fix.age_s <= FIX_STALE_S && (0.0..=FIX_WORST_M).contains(&fix.accuracy_m)) {
        return Proximity::quiet(State::NoFix);
    }
    let pattern = field.pattern_agl_ft.filter(|h| *h > 0.0).unwrap_or(PATTERN_AGL_FT);
    let height = fix.altitude_ft.zip(field.elevation_ft).map(|(a, e)| a - e);
    if height.is_some_and(|h| h > pattern) {
        return Proximity::quiet(State::Above);
    }
    let frame = Flat::about(fix.lat, fix.lon);
    let lines: Vec<Option<Line>> = strips.iter().map(|s| line(&frame, s)).collect();
    let moving = fix.groundspeed_kt.unwrap_or(0.0).max(0.0);
    let track = fix.track_deg.filter(|_| moving > 0.0);
    let lined_up = in_the_air(&lines, track, pattern);
    if height.is_some_and(|h| h >= SURFACE_AGL_FT) || (moving > TAXI_MOST_KT && lined_up.state == State::LinedUp) {
        return lined_up;
    }
    let found = Proximity { hot_spot: nearest_spot(&frame, spots), ..Proximity::quiet(State::Clear) };
    // On a runway: between its ends and within its half width.
    for (i, l) in lines.iter().enumerate() {
        let Some(l) = l else { continue };
        let (along, off) = l.along_across();
        let half = strips[i].width_ft.filter(|w| *w > 0.0).unwrap_or(0.0) / 2.0;
        if (0.0..=l.length).contains(&along) && off <= half.max(1.0) {
            let end = track.map(|t| l.named_end(t));
            return Proximity { state: State::OnRunway, runway: Some(i), end, hold_short_ft: Some(0.0), ..found };
        }
    }
    // Coming up to one: inside the lead of its holding position and
    // closing on it, nearest first.
    let lead = (moving * FT_PER_NM / 3600.0 * LEAD_S).max(LEAD_LEAST_FT);
    let mut best: Option<(usize, f64)> = None;
    for (i, l) in lines.iter().enumerate() {
        let (Some(l), Some(t)) = (l, track) else { continue };
        let near = l.nearest();
        let left = ((near.0 * near.0 + near.1 * near.1).sqrt() - hold_offset_ft(strips[i].width_ft, field.elevation_ft)).max(0.0);
        let way = py_mod(near.0.atan2(near.1).to_degrees(), 360.0);
        if left <= lead && angle_between(t, way) <= CLOSING_DEG && best.is_none_or(|(_, d)| left < d) {
            best = Some((i, left));
        }
    }
    match best {
        Some((i, left)) => {
            let left_end = track.zip(lines[i].as_ref()).map(|(t, l)| l.left_end(t));
            Proximity { state: State::Approaching, runway: Some(i), left_end, hold_short_ft: Some(left), ..found }
        }
        None => found,
    }
}

/// In the air below the pattern, or faster than a taxi on the surface: the
/// runway lined up with, out to where a 3° path stands at the pattern's height.
fn in_the_air(lines: &[Option<Line>], track: Option<f64>, pattern_ft: f64) -> Proximity {
    let clear = Proximity::quiet(State::Clear);
    let Some(track) = track else { return clear };
    let reach = pattern_ft / GLIDE_PATH_DEG.to_radians().tan();
    let best = lines
        .iter()
        .enumerate()
        .filter_map(|(i, l)| l.as_ref()?.lined_up(track, reach).map(|(end, d, off)| (i, end, d, off)))
        // Of parallel runways, the one nearest the airplane's line.
        .min_by(|a, b| a.3.total_cmp(&b.3));
    match best {
        Some((i, end, d, _)) => Proximity { state: State::LinedUp, runway: Some(i), end: Some(end), threshold_ft: Some(d), ..clear },
        None => clear,
    }
}

fn nearest_spot(frame: &Flat, spots: &[HotSpot]) -> Option<(usize, f64)> {
    spots
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let (x, y) = ft(frame, s.lat, s.lon);
            (i, (x * x + y * y).sqrt())
        })
        .filter(|(_, d)| *d <= HOT_SPOT_FT)
        .min_by(|a, b| a.1.total_cmp(&b.1))
}

/// A runway named as its holding position sign has it (AIM 2-3-8 b 1's
/// "15-33"): its two ends as painted, the one `left` first ("27-9"
/// facing north from the south side), end 0 first with none known.
pub fn runway_name(s: &Strip, left: Option<usize>) -> String {
    let first = left.unwrap_or(0);
    format!("{}-{}", runway_number(&s.ends[first].ident), runway_number(&s.ends[1 - first].ident))
}

#[cfg(test)]
mod tests;
