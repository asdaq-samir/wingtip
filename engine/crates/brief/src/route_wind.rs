//! The route's strongest headwind (`route_headwind`): of the nav log's
//! legs, the one whose wind aloft blows most against its course, for the
//! Brief's glance. A route's wind turns as it goes, so the first stretch's
//! wind alone (what the glance showed) said nothing of a later leg flown
//! into a strong one; the leg with the most headwind is the one that slows
//! the flight most and burns the fuel the reserve is held against.
//!
//! The headwind is the wind's component along the leg's true course (the
//! wind triangle, FAA-H-8083-25C ch. 16; the winds aloft forecast's
//! direction is true, FAA-H-8083-28B 27.6, as the course is), the same
//! component as the runway's (runway::wind::headwind_kt): a tailwind
//! negative, so on a route with tailwinds all the way the answer is the
//! least of them.

use crate::gonogo::calls::In;
use crate::json::{self, Value};
use crate::runway::wind;

type R<T> = Result<T, String>;

/// A leg's wind on its course: its course and the wind aloft it is flown
/// in, both true.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LegWind {
    pub course_true_deg: f64,
    pub wind_from_true_deg: f64,
    pub wind_kt: f64,
}

/// The index of the leg with the most headwind and that headwind, kt (the
/// first such leg where two tie); None for no leg.
pub fn strongest_headwind(legs: &[LegWind]) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    for (at, leg) in legs.iter().enumerate() {
        let head = wind::headwind_kt(leg.wind_from_true_deg, leg.wind_kt, leg.course_true_deg);
        if best.is_none_or(|(_, most)| head > most) {
            best = Some((at, head));
        }
    }
    best
}

/// `route_headwind`: `legs` as the nav log gives them (`from`, `to`,
/// `true_course_deg`, `wind` with `wind_dir_true_deg` and `wind_speed_kt`);
/// a leg with no wind or no course is passed over. Null where no leg has
/// both.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    let mut ends = Vec::new();
    let mut legs = Vec::new();
    for leg in i.list(v, "legs")? {
        let (Some(course), Some(aloft)) = (i.opt_num(leg, "true_course_deg")?, i.obj(leg, "wind")?) else {
            continue;
        };
        ends.push((i.opt_str(leg, "from")?.unwrap_or_default(), i.opt_str(leg, "to")?.unwrap_or_default()));
        legs.push(LegWind {
            course_true_deg: course,
            wind_from_true_deg: i.num(aloft, "wind_dir_true_deg")?,
            wind_kt: i.num(aloft, "wind_speed_kt")?,
        });
    }
    let Some((at, head)) = strongest_headwind(&legs) else {
        return Ok("null".into());
    };
    let (from, to) = &ends[at];
    let mut out = String::from("{\"headwind_kt\":");
    // To a tenth of a knot: the forecast gives whole knots.
    json::number(&mut out, (head * 10.0).round() / 10.0);
    out.push_str(",\"from\":");
    json::string(&mut out, from);
    out.push_str(",\"to\":");
    json::string(&mut out, to);
    out.push_str(",\"wind_dir_true_deg\":");
    json::number(&mut out, legs[at].wind_from_true_deg);
    out.push_str(",\"wind_speed_kt\":");
    json::number(&mut out, legs[at].wind_kt);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn leg(course_true_deg: f64, wind_from_true_deg: f64, wind_kt: f64) -> LegWind {
        LegWind { course_true_deg, wind_from_true_deg, wind_kt }
    }

    #[test]
    fn the_leg_flown_most_into_the_wind() {
        // 20 kt 30 degrees off the nose is 17.3 kt of headwind; 25 kt on
        // the nose is 25; 30 kt on the tail is -30.
        let legs = [leg(300.0, 270.0, 20.0), leg(320.0, 320.0, 25.0), leg(0.0, 180.0, 30.0)];
        let (at, head) = strongest_headwind(&legs).unwrap();
        assert_eq!(at, 1);
        assert!((head - 25.0).abs() < 1e-9);
    }

    #[test]
    fn tailwinds_all_the_way_give_the_least_of_them() {
        let (at, head) = strongest_headwind(&[leg(90.0, 270.0, 20.0), leg(90.0, 250.0, 10.0)]).unwrap();
        assert_eq!(at, 1);
        assert!((head + 9.397).abs() < 1e-3);
    }

    #[test]
    fn no_legs_no_answer() {
        assert_eq!(strongest_headwind(&[]), None);
    }
}
