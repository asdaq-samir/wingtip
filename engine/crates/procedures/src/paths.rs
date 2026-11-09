//! The shapes a published procedure's legs are drawn in (#482 phase 4b):
//! an RF or AF leg's arc round its centre fix or DME navaid, a CIFP hold's
//! racetrack (HA, HF, HM), a 45°/180° procedure turn (PI), how far a leg
//! with no end of its own is drawn, and a hold's leg in miles. They were
//! wingtip.procedures' (`_arc`, `_hold`, `_procedure_turn`, `climb_nm`);
//! the planner still reads the CIFP's legs and places their fixes, and
//! asks these by name as it walks them (ARINC 424-18 5.21, Attachment 5).
//!
//! On the planner's sphere (crate::geo), so the points are the ones it
//! drew before to a few micrometres.

use crate::geo::{angle_between, bearing_deg, destination, distance_nm, py_mod};
use crate::json::{self, Value};

/// A hold drawn at a light airplane's speed: a one-minute leg (AIM 5-3-8,
/// at or below 14,000 ft MSL) and standard-rate turns (3° a second) at
/// 120 knots -- two miles on each leg, and turns 0.64 nm round. Charts
/// draw holds to no scale; this is one a light airplane would fly, not a
/// jet's at the 200 KIAS a hold from the minimum holding altitude to
/// 6,000 ft MSL may be flown at (AIM 5-3-8, Holding, its Airspeeds: 200
/// KIAS to 6,000 ft, 230 from 6,001 to 14,000 and 265 from 14,001; not
/// TBL 5-3-1, which is the CPDLC message table).
pub const HOLD_SPEED_KT: f64 = 120.0;

/// A standard-rate turn's radius at HOLD_SPEED_KT, nm: a full turn in two
/// minutes.
pub fn hold_turn_nm() -> f64 {
    HOLD_SPEED_KT * (120.0 / 3600.0) / (2.0 * std::f64::consts::PI)
}

/// How long a leg with no end is drawn, nm: about a turn's worth at a
/// light airplane's speed, enough to show which way it goes.
pub const OPEN_LEG_NM: f64 = 2.0;
/// The climb a leg flown to an altitude (CA, VA, FA) is drawn at, ft a nm:
/// the standard 200 a departure and a missed approach are designed for
/// (FAA Order 8260.3), so the turn after it comes where an airplane
/// climbing at that gradient reaches the altitude. Kept within
/// CLIMB_LEG_NM.
pub const CLIMB_FT_PER_NM: f64 = 200.0;
pub const CLIMB_LEG_NM: (f64, f64) = (1.0, 15.0);

/// A procedure turn as a light airplane flies it, nm: outbound from the
/// fix on the final's reciprocal, about where a plate draws its barb (El
/// Dorado's ILS 22, some four miles out from LADOS), then a minute on the
/// turn's 45° course before the 180° turn back, inside the 10 NM a
/// procedure turn is kept within unless the chart says otherwise (AIM
/// 5-4-9).
pub const PT_OUTBOUND_NM: f64 = 4.0;
pub const PT_LEG_NM: f64 = 2.0;

type P = (f64, f64);

fn go(p: P, bearing: f64, nm: f64) -> P {
    destination(p.0, p.1, bearing, nm)
}

/// Points along an arc round `center` from `start` to `end`, turning right
/// (clockwise) or left, a point every five degrees, at the distance from
/// the centre to the end: an RF leg round its centre fix, an AF (DME arc)
/// round its navaid.
pub fn arc(center: P, start: P, end: P, right: bool) -> Vec<P> {
    let radius = distance_nm(center.0, center.1, end.0, end.1);
    let a = bearing_deg(center.0, center.1, start.0, start.1);
    let b = bearing_deg(center.0, center.1, end.0, end.1);
    let sweep = if right { py_mod(b - a, 360.0) } else { -py_mod(a - b, 360.0) };
    let steps = 2usize.max((sweep.abs() / 5.0) as usize + 1);
    (1..=steps).map(|i| go(center, py_mod(a + sweep * i as f64 / steps as f64, 360.0), radius)).collect()
}

/// A holding pattern's racetrack at `fix`, its inbound leg on the true
/// course `inbound` ending at the fix and its turns to the right or the
/// left (AIM 5-3-8): the fix, the turn out, the outbound leg, the turn in,
/// and back to the fix.
pub fn hold(fix: P, inbound: f64, right: bool, leg_nm: f64) -> Vec<P> {
    let side = if right { 90.0 } else { -90.0 };
    let sweep = if right { 180.0 } else { -180.0 };
    let r = hold_turn_nm();
    let entry = go(fix, py_mod(inbound + 180.0, 360.0), leg_nm);
    let first = go(fix, py_mod(inbound + side, 360.0), r);
    let second = go(entry, py_mod(inbound + side, 360.0), r);
    let out_start = go(fix, py_mod(inbound + side, 360.0), 2.0 * r);
    let out_end = go(out_start, py_mod(inbound + 180.0, 360.0), leg_nm);
    let mut points = vec![fix];
    points.extend((0..=36).map(|i| go(first, py_mod(inbound - side + sweep * i as f64 / 36.0, 360.0), r)));
    points.push(out_start);
    points.push(out_end);
    points.extend((0..=36).map(|i| go(second, py_mod(inbound + side + sweep * i as f64 / 36.0, 360.0), r)));
    points.push(entry);
    points.push(fix);
    points
}

/// A hold's leg, nm: a timed leg flown at HOLD_SPEED_KT, else the
/// distance the CIFP codes (AIM 5-3-8 j.4).
pub fn hold_leg_nm(minutes: Option<f64>, distance_nm: Option<f64>) -> Option<f64> {
    minutes.map(|m| HOLD_SPEED_KT * m / 60.0).or(distance_nm)
}

/// A 45°/180° procedure turn at `fix` (AIM 5-4-9): out from the fix on
/// the reciprocal of the final's true course `inbound`, onto the turn's
/// true course `pt_course` (the chart's barb), a 180° turn toward the
/// final's side, and back on the reciprocal of `pt_course` to meet the
/// final's course, and in to the fix.
pub fn procedure_turn(fix: P, inbound: f64, pt_course: f64) -> Vec<P> {
    let out = py_mod(inbound + 180.0, 360.0);
    let barb = py_mod(pt_course - out + 540.0, 360.0) - 180.0;
    let sign = if barb > 0.0 { -1.0 } else { 1.0 };
    let r = hold_turn_nm();
    let a = go(fix, out, PT_OUTBOUND_NM);
    let b = go(a, pt_course, PT_LEG_NM);
    let center = go(b, py_mod(pt_course + 90.0 * sign, 360.0), r);
    let turn: Vec<P> = (0..=18).map(|i| go(center, py_mod(pt_course - 90.0 * sign + sign * 180.0 * i as f64 / 18.0, 360.0), r)).collect();
    let back = py_mod(pt_course + 180.0, 360.0);
    let end = *turn.last().expect("nineteen points");
    let off = |s: f64| {
        let to = go(fix, out, s);
        angle_between(bearing_deg(end.0, end.1, to.0, to.1), back)
    };
    // Where the way back meets the final's course, searched every 0.05 nm
    // from 0.5 to 10, the first of the closest as Python's min picks it.
    let mut meet = 0.5;
    let mut least = f64::INFINITY;
    for s in 10..200 {
        let nm = s as f64 / 20.0;
        let o = off(nm);
        if o < least {
            least = o;
            meet = nm;
        }
    }
    let mut points = vec![fix, a, b];
    points.extend(turn);
    points.push(go(fix, out, meet));
    points.push(fix);
    points
}

/// How far a leg flown to its altitude goes, nm: from the altitude known
/// at its start, at CLIMB_FT_PER_NM, within CLIMB_LEG_NM; OPEN_LEG_NM where
/// either is not known, or it is not a climb.
pub fn climb_nm(altitude_ft: Option<f64>, known_ft: Option<f64>) -> f64 {
    match (altitude_ft, known_ft) {
        (Some(to), Some(from)) if to > from => ((to - from) / CLIMB_FT_PER_NM).clamp(CLIMB_LEG_NM.0, CLIMB_LEG_NM.1),
        _ => OPEN_LEG_NM,
    }
}

pub const NAMES: [&str; 5] = ["procedure_arc", "procedure_hold", "procedure_turn", "procedure_climb_nm", "procedure_hold_leg_nm"];

fn num(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is not a number"))
}

fn opt_num(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn point(name: &str, v: &Value, key: &str) -> Result<P, String> {
    match v.get(key).and_then(Value::as_array) {
        Some([lat, lon]) => match (lat.as_f64(), lon.as_f64()) {
            (Some(lat), Some(lon)) => Ok((lat, lon)),
            _ => Err(format!("{name}: \"{key}\" is not [lat, lon]")),
        },
        _ => Err(format!("{name}: \"{key}\" is not [lat, lon]")),
    }
}

fn right(name: &str, v: &Value) -> Result<bool, String> {
    match v.get("turn").and_then(Value::as_str) {
        Some("R") => Ok(true),
        Some("L") => Ok(false),
        _ => Err(format!("{name}: \"turn\" is not \"R\" or \"L\"")),
    }
}

fn points_json(points: &[P]) -> String {
    let mut out = String::from("[");
    for (i, (lat, lon)) in points.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        json::number(&mut out, *lat);
        out.push(',');
        json::number(&mut out, *lon);
        out.push(']');
    }
    out.push(']');
    out
}

/// The rule `name` worked on `v`:
/// - `procedure_arc`: `[[lat, lon]]` from `{"center", "start", "end",
///   "turn": "R"|"L"}`, each place `[lat, lon]`;
/// - `procedure_hold`: the racetrack from `{"fix", "inbound_deg", "turn",
///   "leg_nm"}`;
/// - `procedure_turn`: the turn from `{"fix", "inbound_deg",
///   "pt_course_deg"}`;
/// - `procedure_climb_nm`: nm, from `{"altitude_ft"?, "known_ft"?}`;
/// - `procedure_hold_leg_nm`: nm or null, from `{"minutes"?,
///   "distance_nm"?}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "procedure_arc" => Ok(points_json(&arc(point(name, v, "center")?, point(name, v, "start")?, point(name, v, "end")?, right(name, v)?))),
        "procedure_hold" => {
            Ok(points_json(&hold(point(name, v, "fix")?, num(name, v, "inbound_deg")?, right(name, v)?, num(name, v, "leg_nm")?)))
        }
        "procedure_turn" => Ok(points_json(&procedure_turn(point(name, v, "fix")?, num(name, v, "inbound_deg")?, num(name, v, "pt_course_deg")?))),
        "procedure_climb_nm" => {
            let mut out = String::new();
            json::number(&mut out, climb_nm(opt_num(name, v, "altitude_ft")?, opt_num(name, v, "known_ft")?));
            Ok(out)
        }
        "procedure_hold_leg_nm" => {
            let mut out = String::new();
            json::opt_number(&mut out, hold_leg_nm(opt_num(name, v, "minutes")?, opt_num(name, v, "distance_nm")?));
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hold_at_120_kt_turns_0_64_nm_round_and_closes_at_its_fix() {
        assert!((hold_turn_nm() - 0.6366).abs() < 1e-4);
        let fix = (34.2, -118.36);
        let track = hold(fix, 80.0, true, 2.0);
        assert_eq!(track.len(), 1 + 37 + 2 + 37 + 2);
        assert_eq!(*track.last().unwrap(), fix);
        // The outbound leg is on the right of the inbound course.
        let out = track[38];
        let side = bearing_deg(fix.0, fix.1, out.0, out.1);
        assert!(angle_between(side, 170.0) < 1.0, "{side}");
    }

    #[test]
    fn an_arc_sweeps_the_way_it_turns_a_point_every_five_degrees() {
        let c = (34.0, -118.0);
        let start = destination(c.0, c.1, 0.0, 5.0);
        let end = destination(c.0, c.1, 90.0, 5.0);
        let right_way = arc(c, start, end, true);
        // A quarter turn right is 18 or 19 points (the bearing at the end
        // a hair either side of 90 degrees on the sphere), three quarters
        // left 54 or 55.
        assert!((18..=19).contains(&right_way.len()), "{}", right_way.len());
        let left_way = arc(c, start, end, false);
        assert!((54..=55).contains(&left_way.len()), "{}", left_way.len());
        for p in right_way.iter().chain(&left_way) {
            assert!((distance_nm(c.0, c.1, p.0, p.1) - 5.0).abs() < 1e-6);
        }
    }

    #[test]
    fn a_climb_leg_at_200_ft_a_mile_within_1_to_15() {
        assert_eq!(climb_nm(Some(3000.0), Some(2600.0)), 2.0);
        assert_eq!(climb_nm(Some(3000.0), Some(2950.0)), 1.0);
        assert_eq!(climb_nm(Some(9000.0), Some(0.0)), 15.0);
        assert_eq!(climb_nm(None, Some(0.0)), OPEN_LEG_NM);
        assert_eq!(hold_leg_nm(Some(1.0), Some(4.0)), Some(2.0));
        assert_eq!(hold_leg_nm(None, Some(4.0)), Some(4.0));
    }

    #[test]
    fn a_procedure_turn_comes_back_onto_the_final() {
        let fix = (33.2, -92.8);
        let turn = procedure_turn(fix, 220.0, 355.0);
        assert_eq!(turn.len(), 3 + 19 + 2);
        let met = turn[turn.len() - 2];
        // The point it meets is on the final's reciprocal, within 10 nm.
        let d = distance_nm(fix.0, fix.1, met.0, met.1);
        assert!(d > 0.5 && d <= 10.0, "{d}");
        assert!(angle_between(bearing_deg(fix.0, fix.1, met.0, met.1), 40.0) < 0.5);
    }
}
