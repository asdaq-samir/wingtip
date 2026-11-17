//! How far each of a procedure's coded legs is drawn, and where its path
//! is flown round a course reversal (#482): the planner's
//! wingtip.procedures walked the legs with its own OPEN_LEG_NM, and
//! wingtip.procedure_paths decided a course reversal with its own 90° and
//! 120°. The planner still reads the CIFP and places the fixes; it asks
//! these by name as it walks them (ARINC 424-18 5.21, Attachment 5).

use crate::json::{self, Value};
use crate::paths::{climb_nm, OPEN_LEG_NM};
use wingtip_core::ask::Ask;

/// How far a path turns at a fix the chart puts a course reversal at --
/// a hold in lieu of a procedure turn, or a procedure turn -- for it to be
/// flown, degrees: come to from the far side, more than 90° off the course
/// it leaves the fix on. From the near side a pilot is lined up already,
/// as a TAA's straight-in area and a feeder marked NoPT are, and makes
/// none (AIM 5-4-5's TAA, 5-4-9 a; 14 CFR 91.175(j): "no pilot may make a procedure
/// turn unless cleared to do so by ATC" on a NoPT route, a vector to the
/// final or a timed approach from a holding fix).
pub const CODED_REVERSAL_DEG: f64 = 90.0;

/// How far a path turns at a fix with no reversal coded there for the
/// pilot to fly a teardrop back onto it, degrees: a course reversal, not a
/// turn onto the next leg (AIM 5-4-9 a's teardrop, flown where the path
/// doubles back). Never at the procedure's first fix, where a pilot turns
/// onto its first leg from the route however far.
pub const TEARDROP_DEG: f64 = 120.0;

/// How far a leg with no fix of its own to end at is drawn, nm: an FC
/// leg's coded distance from its fix (ARINC 424-18 5.27); a leg flown to an
/// altitude (FA, CA, VA) at the climb's gradient (paths::climb_nm, FAA
/// Order 8260.3's 200 ft a nm); any other (to a DME distance, a radial,
/// an intercept, a manual termination) OPEN_LEG_NM, enough to show which
/// way it goes.
pub fn leg_nm(path: &str, distance_nm: Option<f64>, altitude_ft: Option<f64>, known_ft: Option<f64>) -> f64 {
    match (path, distance_nm) {
        ("FC", Some(d)) if d > 0.0 => d,
        ("FA" | "CA" | "VA", _) => climb_nm(altitude_ft, known_ft),
        _ => OPEN_LEG_NM,
    }
}

/// The course reversal flown at a fix the path turns `turn_deg` at: the
/// chart's own hold or procedure turn there ("coded"), entered, where it
/// is come to from the far side (CODED_REVERSAL_DEG); else, past the
/// procedure's first fix, a teardrop where the path doubles back
/// (TEARDROP_DEG); else none, the path flown on as it is.
pub fn reversal(turn_deg: f64, coded: bool, first_fix: bool) -> Option<&'static str> {
    if coded {
        return (turn_deg > CODED_REVERSAL_DEG).then_some("coded");
    }
    (!first_fix && turn_deg > TEARDROP_DEG).then_some("teardrop")
}

/// - `procedure_leg_nm`: nm, from `{"path", "distance_nm"?, "altitude_ft"?,
///   "known_ft"?}`;
/// - `procedure_reversal`: "coded", "teardrop" or null, from `{"turn_deg",
///   "coded"?, "first_fix"?}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "procedure_leg_nm" => json::number(
            &mut out,
            leg_nm(ask.str("path")?, ask.opt_num("distance_nm")?, ask.opt_num("altitude_ft")?, ask.opt_num("known_ft")?),
        ),
        "procedure_reversal" => {
            json::opt_string(&mut out, reversal(ask.num("turn_deg")?, ask.opt_bool("coded")?, ask.opt_bool("first_fix")?))
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_fc_leg_is_its_coded_distance_and_a_climb_its_gradient() {
        assert_eq!(leg_nm("FC", Some(4.0), None, None), 4.0);
        // An FC leg with no distance coded, or none of it, is drawn open.
        assert_eq!(leg_nm("FC", None, None, None), OPEN_LEG_NM);
        assert_eq!(leg_nm("FC", Some(0.0), None, None), OPEN_LEG_NM);
        // 400 ft to climb at 200 ft a nm (FAA Order 8260.3) is 2 nm.
        for path in ["FA", "CA", "VA"] {
            assert_eq!(leg_nm(path, None, Some(3000.0), Some(2600.0)), 2.0);
            assert_eq!(leg_nm(path, None, Some(3000.0), None), OPEN_LEG_NM);
        }
        for path in ["FD", "FM", "CD", "CI", "CR", "VD", "VI", "VM", "VR"] {
            assert_eq!(leg_nm(path, Some(7.0), Some(9000.0), Some(0.0)), OPEN_LEG_NM, "{path}");
        }
    }

    #[test]
    fn a_coded_reversal_is_flown_from_its_far_side_only() {
        // AIM 5-4-9: past 90° off the course out, the pilot is on the far
        // side and flies it; at 90° or less, lined up already, none.
        assert_eq!(reversal(90.5, true, false), Some("coded"));
        assert_eq!(reversal(90.0, true, false), None);
        assert_eq!(reversal(45.0, true, true), None);
        // At the procedure's first fix as well.
        assert_eq!(reversal(170.0, true, true), Some("coded"));
    }

    #[test]
    fn a_teardrop_where_the_path_doubles_back_past_its_first_fix() {
        assert_eq!(reversal(120.5, false, false), Some("teardrop"));
        assert_eq!(reversal(120.0, false, false), None);
        assert_eq!(reversal(170.0, false, true), None);
    }

    #[test]
    fn asked_by_name() {
        let v = json::parse(r#"{"path": "FC", "distance_nm": 3.5}"#).unwrap();
        assert_eq!(call("procedure_leg_nm", &v).unwrap(), "3.5");
        let v = json::parse(r#"{"turn_deg": 150, "coded": true}"#).unwrap();
        assert_eq!(call("procedure_reversal", &v).unwrap(), "\"coded\"");
        let v = json::parse(r#"{"turn_deg": 60}"#).unwrap();
        assert_eq!(call("procedure_reversal", &v).unwrap(), "null");
        assert!(call("procedure_reversal", &json::parse("{}").unwrap()).is_err());
    }
}
