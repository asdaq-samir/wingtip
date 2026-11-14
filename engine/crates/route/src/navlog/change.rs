//! A pilot's own change of altitude at a waypoint, as the profile's
//! per-leg altitude sets it: **Start At** (the climb or descent begins at
//! the waypoint) or **Cross At** (it is done by the waypoint), and where
//! along the route it begins and ends. The climb is the picked airplane's
//! (wingtip_flight::performance: its best-rate climb, slower the thinner
//! the air, PHAK ch. 11) over the ground at its own ground speed, the wind
//! triangle at the climb speed in the leg's wind, as with_climbs flies it; the descent is the nav log's three
//! to one (DESCENT_FT_PER_NM, about a 3° path, AIM 2-1-2) at the leg's
//! ground speed and burn, as with_descents places it. With no airplane
//! there is no time or fuel (the owner, 2026-11-09: nothing assumes an
//! airplane): a descent keeps its geometry, a climb has none to give and is
//! drawn as a step at the waypoint.

use super::legs::wind_triangle;
use super::{Profile, R};
use crate::json::{self, Value};
use crate::motion::profile::DESCENT_FT_PER_NM;
use wingtip_flight::flight::isa_temp_c;
use wingtip_flight::performance::Climber;

/// Where the change is flown relative to its waypoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    StartAt,
    CrossAt,
}

/// The leg's air and speeds the change is flown in, where the planner has them.
#[derive(Clone, Copy, Debug, Default)]
pub struct Air {
    pub groundspeed_kt: Option<f64>,
    pub tas_kt: Option<f64>,
    pub fuel_burn_gph: Option<f64>,
    pub oat_c: Option<f64>,
    /// The leg's true course, degrees, and its wind (from, degrees true,
    /// and knots): the climb's own wind triangle. Where a caller gives
    /// neither, the climb's ground speed is the leg's scaled by the
    /// airspeeds, which scales the wind too (with_climbs' old way).
    pub true_course_deg: Option<f64>,
    pub wind: Option<(f64, f64)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Change {
    pub kind: &'static str,
    pub begins_nm: f64,
    pub ends_nm: f64,
    /// Feet gained or lost each nautical mile; None for a climb with no
    /// airplane's figures, drawn as a step.
    pub ft_per_nm: Option<f64>,
    pub minutes: Option<f64>,
    pub gallons: Option<f64>,
}

/// The change from `from_ft` to `to_ft` at the waypoint `along_nm` along
/// the route.
pub fn change(along_nm: f64, from_ft: f64, to_ft: f64, mode: Mode, profile: Option<&Profile>, air: Air) -> Change {
    let place = |distance_nm: f64| match mode {
        Mode::StartAt => (along_nm, along_nm + distance_nm),
        Mode::CrossAt => ((along_nm - distance_nm).max(0.0), along_nm),
    };
    if to_ft == from_ft {
        return Change { kind: "level", begins_nm: along_nm, ends_nm: along_nm, ft_per_nm: None, minutes: None, gallons: None };
    }
    if to_ft < from_ft {
        let distance = (from_ft - to_ft) / DESCENT_FT_PER_NM;
        let (begins_nm, ends_nm) = place(distance);
        let minutes = profile.and(air.groundspeed_kt).filter(|g| *g > 0.0).map(|gs| distance / gs * 60.0);
        let gallons = minutes.zip(air.fuel_burn_gph).map(|(m, burn)| m / 60.0 * burn);
        return Change { kind: "descent", begins_nm, ends_nm, ft_per_nm: Some(DESCENT_FT_PER_NM), minutes, gallons };
    }
    let Some((p, climb_tas)) = profile.and_then(|p| p.airplane.climb_tas_kt().map(|t| (p, t))) else {
        return Change { kind: "climb", begins_nm: along_nm, ends_nm: along_nm, ft_per_nm: None, minutes: None, gallons: None };
    };
    let isa_dev = air.oat_c.map_or(0.0, |oat| oat - isa_temp_c(to_ft));
    let climb = Climber::new(&p.airplane).climb(from_ft, to_ft, isa_dev);
    // Over the ground at the climb's own ground speed: the wind triangle
    // at the climb speed (FAA-H-8083-25C, PHAK ch. 16), as with_climbs
    // flies it, at least 1 kt where a crosswind stronger than the climb
    // speed holds no heading. Without the leg's course and wind, the
    // leg's ground speed scaled by the airspeeds; still air without that.
    let climb_gs = match (air.true_course_deg, air.wind, air.groundspeed_kt, air.tas_kt) {
        (Some(tc), Some(wind), _, _) => wind_triangle(tc, Some(wind), climb_tas).1.max(1.0),
        (_, _, Some(gs), Some(tas)) if tas > 0.0 => (gs * climb_tas / tas).max(1.0),
        _ => climb_tas,
    };
    let distance = climb_gs * climb.minutes / 60.0;
    let (begins_nm, ends_nm) = place(distance);
    Change {
        kind: "climb",
        begins_nm,
        ends_nm,
        ft_per_nm: (distance > 0.0).then(|| (to_ft - from_ft) / distance),
        minutes: Some(climb.minutes),
        // Not known where the profile gives no climb fuel flow.
        gallons: p.airplane.climb_burn_gph().map(|_| climb.gallons),
    }
}

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num(name: &str, v: &Value, key: &str) -> R<f64> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// `altitude_change`, JSON in and out.
pub fn call(name: &str, v: &Value) -> R<String> {
    let mode = match v.get("mode").and_then(Value::as_str) {
        Some("start_at") => Mode::StartAt,
        Some("cross_at") => Mode::CrossAt,
        _ => return Err(format!("{name}: \"mode\" is \"start_at\" or \"cross_at\"")),
    };
    let profile = match v.get("profile") {
        None | Some(Value::Null) => None,
        Some(p) => Some(Profile::read(name, p)?),
    };
    let air = Air {
        groundspeed_kt: opt_num(name, v, "groundspeed_kt")?,
        tas_kt: opt_num(name, v, "tas_kt")?,
        fuel_burn_gph: opt_num(name, v, "fuel_burn_gph")?,
        oat_c: opt_num(name, v, "oat_c")?,
        true_course_deg: opt_num(name, v, "true_course_deg")?,
        wind: opt_num(name, v, "wind_dir_true_deg")?.zip(opt_num(name, v, "wind_speed_kt")?),
    };
    let c = change(num(name, v, "along_nm")?, num(name, v, "from_ft")?, num(name, v, "to_ft")?, mode, profile.as_ref(), air);
    let n = |x: Option<f64>| x.map_or(Value::Null, Value::Number);
    let out = Value::Object(
        [
            ("kind", Value::String(c.kind.to_owned())),
            ("begins_nm", Value::Number(c.begins_nm)),
            ("ends_nm", Value::Number(c.ends_nm)),
            ("ft_per_nm", n(c.ft_per_nm)),
            ("minutes", n(c.minutes)),
            ("gallons", n(c.gallons)),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v))
        .collect(),
    );
    let mut s = String::new();
    json::value(&mut s, &out);
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_descent_is_three_to_one_and_cross_at_ends_at_the_waypoint() {
        let c = change(50.0, 5500.0, 3500.0, Mode::CrossAt, None, Air::default());
        assert_eq!(c.kind, "descent");
        assert!((c.begins_nm - 44.0).abs() < 1e-9 && c.ends_nm == 50.0);
        assert_eq!(c.minutes, None);
        let s = change(50.0, 5500.0, 3500.0, Mode::StartAt, None, Air::default());
        assert!(s.begins_nm == 50.0 && (s.ends_nm - 56.0).abs() < 1e-9);
    }

    #[test]
    fn a_climb_with_no_airplane_is_a_step_at_the_waypoint() {
        let c = change(20.0, 3500.0, 5500.0, Mode::StartAt, None, Air::default());
        assert_eq!((c.kind, c.begins_nm, c.ends_nm, c.ft_per_nm, c.minutes), ("climb", 20.0, 20.0, None, None));
    }

    #[test]
    fn a_climb_given_the_legs_wind_covers_its_own_ground_speed() {
        // 20 kt on the nose: the 70 kt climb makes 50 over the ground (the
        // wind triangle, PHAK ch. 16), where the cruise's 80 scaled by
        // 70/100 said 56. Without course and wind, the old scaling.
        let p = Profile {
            airplane: wingtip_flight::performance::Airplane {
                cruise_tas_kt: 100.0,
                fuel_burn_gph: 8.0,
                climb_tas_kt: Some(70.0),
                climb_rate_fpm_sea_level: Some(800.0),
                service_ceiling_ft: 14000.0,
                ..Default::default()
            },
            ..Profile::default()
        };
        let leg = Air { groundspeed_kt: Some(80.0), tas_kt: Some(100.0), ..Air::default() };
        let windy = Air { true_course_deg: Some(0.0), wind: Some((360.0, 20.0)), ..leg };
        let c = change(0.0, 500.0, 3500.0, Mode::StartAt, Some(&p), windy);
        assert!((c.ends_nm - 50.0 * c.minutes.unwrap() / 60.0).abs() < 1e-9);
        let old = change(0.0, 500.0, 3500.0, Mode::StartAt, Some(&p), leg);
        assert!((old.ends_nm - 56.0 * old.minutes.unwrap() / 60.0).abs() < 1e-9);
    }
}
