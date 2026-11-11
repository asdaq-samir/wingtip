//! A pilot's hold flown on the nav log's leg (the planner's
//! wingtip.flight_plan.with_holds, a leg at a time, and wingtip.holds.racetrack):
//! its minutes at the leg's true airspeed and cruise burn added to the
//! leg's time and fuel, so the totals and the fuel required (14 CFR
//! 91.151, 91.167) are the flight's with the hold, and the leg says the
//! hold for the map and the dry run.
//!
//! A no-wind racetrack at the leg's true airspeed: a pilot corrects for
//! the wind as it is found there, and a timed hold's lap takes as long
//! whatever the wind (its inbound leg is the timed one, its outbound
//! adjusted to it; AIM 5-3-8 j.4).

use super::{number, object, py_round, Obj, R};
use crate::figures::holding;
use crate::geo::{destination, py_mod};
use crate::json::Value;
use crate::route::holds::{self, Leg};

/// One turn round the racetrack from the fix, [lat, lon] pairs: the turn
/// at the fix toward the holding side, the outbound leg, the turn back,
/// and the inbound leg to the fix again, each turn a standard-rate one
/// (holds::turn_radius_nm). True degrees.
pub fn racetrack(fix: (f64, f64), inbound_true_deg: f64, right: bool, tas_kt: f64, leg_nm: f64, steps: usize) -> Vec<(f64, f64)> {
    let side = if right { 1.0 } else { -1.0 };
    let r = holds::turn_radius_nm(tas_kt);
    let c1 = destination(fix.0, fix.1, py_mod(inbound_true_deg + 90.0 * side, 360.0), r);
    let c2 = destination(c1.0, c1.1, py_mod(inbound_true_deg + 180.0, 360.0), leg_nm);
    let arc = |center: (f64, f64), start_deg: f64| -> Vec<(f64, f64)> {
        (0..=steps).map(|k| destination(center.0, center.1, py_mod(start_deg + side * 180.0 * k as f64 / steps as f64, 360.0), r)).collect()
    };
    let first = arc(c1, inbound_true_deg - 90.0 * side);
    let second = arc(c2, inbound_true_deg + 90.0 * side);
    let mut path = vec![fix];
    path.extend(&first[1..]);
    path.extend(second);
    path.push(fix);
    path
}

/// The hold as wingtip.holds reads it (`hold_read`'s answer): `{"fix",
/// "inbound", "right", "leg_min"?, "leg_nm"?, "turns"?, "minutes"?}`.
pub struct Held {
    pub fix: String,
    pub inbound: f64,
    pub right: bool,
    pub leg_min: Option<f64>,
    pub leg_nm: Option<f64>,
    pub turns: Option<f64>,
    pub minutes: Option<f64>,
}

impl Held {
    pub fn read(name: &str, v: &Value) -> R<Held> {
        let o = Obj::read(name, v)?;
        let e = |e: String| format!("{name}: the hold's {e}");
        Ok(Held {
            fix: o.text("fix").unwrap_or("").to_owned(),
            inbound: o.num("inbound").map_err(e)?,
            right: matches!(o.get("right"), Some(Value::Bool(true))),
            leg_min: o.opt("leg_min").map_err(e)?,
            leg_nm: o.opt("leg_nm").map_err(e)?,
            turns: o.opt("turns").map_err(e)?,
            minutes: o.opt("minutes").map_err(e)?,
        })
    }

    /// Its legs as the figures take them: timed, else by distance (none
    /// given is a minute).
    fn leg(&self) -> Leg {
        match self.leg_min {
            Some(m) => Leg::Minutes(m),
            None => Leg::Nm(self.leg_nm.unwrap_or(0.0)),
        }
    }
}

/// The leg with the hold flown on it: `leg` the leg it is flown on (the
/// leg leaving its point, or at the destination the leg into it), `before`
/// the leg flown to the point (its course is the arrival's, which picks
/// the entry, AIM 5-3-8 j.3), `fix` the point and `variation_deg` the
/// magnetic variation there (the hold's inbound course is magnetic, the
/// racetrack drawn in true). A leg with no time (unflyable) is left as it
/// is.
pub fn hold_on_leg(leg: &Obj, before: &Obj, hold: &Held, fix: (f64, f64), variation_deg: f64, at_end: bool) -> R<Obj> {
    let mut leg = leg.clone();
    let Some(ete) = leg.opt("ete_min")? else { return Ok(leg) };
    let tas = leg.num("tas_kt")?;
    // Magnetic = true - variation, east positive: the course flown to the
    // point, and the hold's inbound course in true.
    let arrival = py_mod(before.num("true_course_deg")? - before.num("magnetic_variation_deg")?, 360.0);
    let inbound_true = py_mod(hold.inbound + variation_deg, 360.0);
    let leg_nm = hold.leg_nm.unwrap_or_else(|| hold.leg_min.filter(|m| *m != 0.0).unwrap_or(1.0) * tas / 60.0);
    let minutes = holds::held_minutes(hold.leg(), hold.turns, hold.minutes, tas);
    let gal = minutes / 60.0 * leg.num("fuel_burn_gph")?;
    leg.set_num("ete_min", py_round(ete + minutes, 1));
    if let Some(fuel) = leg.opt("fuel_gal")? {
        leg.set_num("fuel_gal", py_round(fuel + gal, 2));
    }
    let path = racetrack(fix, inbound_true, hold.right, tas, leg_nm, 12)
        .into_iter()
        .map(|(lat, lon)| Value::Array(vec![number(lat), number(lon)]))
        .collect();
    let opt = |v: Option<f64>| v.map(number).unwrap_or(Value::Null);
    leg.set(
        "hold",
        object(vec![
            ("fix", Value::String(hold.fix.clone())),
            ("inbound_deg", number(hold.inbound)),
            ("right", Value::Bool(hold.right)),
            ("leg_min", opt(hold.leg_min)),
            ("leg_nm", opt(hold.leg_nm)),
            ("turns", opt(hold.turns)),
            ("minutes", number(py_round(minutes, 1))),
            ("lap_min", number(py_round(holds::lap_minutes(hold.leg(), tas), 2))),
            ("gal", number(py_round(gal, 2))),
            ("entry", Value::String(holding::entry(arrival, hold.inbound, hold.right).key().to_owned())),
            ("path", Value::Array(path)),
            ("at_end", Value::Bool(at_end)),
        ]),
    );
    Ok(leg)
}
