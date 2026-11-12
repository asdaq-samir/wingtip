//! The wind and temperature a leg flies in, read from the winds-aloft
//! grid the map's flow layer draws (the weather service's app.flow_awc
//! and app.flow_aloft; the owner, 2026-11-12: the map and the plan agree):
//! a column of levels at the leg's place for each hour of the grid round
//! the leg's time, read at the leg's altitude and then at its time.
//!
//! - The levels are AWC's GFA levels (aviation_grids::WIND_LEVELS): an
//!   altitude MSL under 18,000 ft, a flight level from FL180 (14 CFR
//!   71.33; GFA help, "Winds"). A column takes a flight level at its
//!   hundreds of feet, as a pilot reading an FB took its 18,000 column
//!   for the 18,000 ft cruise: the two differ by the day's pressure, a
//!   few hundred feet, over which the wind barely changes.
//! - Between two levels: winds::wind_at_altitude, the column as its
//!   station -- the direction the short way round, the speed and the
//!   temperature linear in altitude, clamped (the temperature with its
//!   difference from standard) past the ends. The way a pilot read
//!   between the FB's levels (FAA-H-8083-28B 27.2.1.1.1); a level under
//!   the ground, which AWC sends no wind for, is left out of the column.
//! - Between two hours: the same, in time -- the grid's hours are two
//!   hours apart at most (the flow layer's timeline), and a forecast
//!   is not read as changing in steps at each hour. Outside the hours
//!   given, the nearest hour's; the host gives the hours round the time.
//!
//! The grid's points are each wind's east and north parts (u, v, knots,
//! toward where it blows), as the weather service stores them; turned
//! here into the direction it blows from, true, and its speed.

use crate::json::{self, Value};
use crate::winds::{self, WindAt};
use wingtip_core::sort::StableSort;

/// One level of a grid column: its altitude and, where the grid has
/// them there, the wind's east and north parts (kt) and the temperature.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Level {
    pub altitude_ft: f64,
    pub u_kt: Option<f64>,
    pub v_kt: Option<f64>,
    pub temp_c: Option<f64>,
}

/// A column at one hour of the grid, `valid_s` its time, UNIX seconds.
#[derive(Clone, Debug, PartialEq)]
pub struct Hour {
    pub valid_s: f64,
    pub levels: Vec<Level>,
}

/// The air at an altitude and time: None for what the grid has nothing of.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aloft {
    pub wind: Option<WindAt>,
    pub temp_c: Option<f64>,
}

/// The wind from its east and north parts: the direction it blows from,
/// true, 0 to 360, and its speed. A part of (0, 0) is a calm, from 360.
pub fn from_parts(u_kt: f64, v_kt: f64) -> WindAt {
    let speed_kt = u_kt.hypot(v_kt);
    let dir = (-u_kt).atan2(-v_kt).to_degrees();
    let dir_true_deg = if speed_kt == 0.0 { 360.0 } else { crate::geo::py_mod(dir, 360.0) };
    WindAt { dir_true_deg, speed_kt }
}

/// One hour's column read at an altitude.
pub fn at_altitude(hour: &Hour, altitude_ft: f64) -> Aloft {
    let winds: Vec<(f64, Option<f64>, f64)> = hour
        .levels
        .iter()
        .filter_map(|l| match (l.u_kt, l.v_kt) {
            (Some(u), Some(v)) if u.is_finite() && v.is_finite() => {
                let w = from_parts(u, v);
                Some((l.altitude_ft, Some(w.dir_true_deg), w.speed_kt))
            }
            _ => None,
        })
        .collect();
    let mut profile: Vec<(f64, f64)> =
        hour.levels.iter().filter_map(|l| l.temp_c.filter(|t| t.is_finite()).map(|t| (l.altitude_ft, t))).collect();
    profile.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    Aloft { wind: winds::wind_at_altitude(&winds, altitude_ft), temp_c: winds::temperature_at(&profile, altitude_ft) }
}

fn between_winds(a: Option<WindAt>, b: Option<WindAt>, frac: f64) -> Option<WindAt> {
    match (a, b) {
        (Some(a), Some(b)) => Some(WindAt {
            dir_true_deg: winds::interp_direction(a.dir_true_deg, b.dir_true_deg, frac),
            speed_kt: a.speed_kt + frac * (b.speed_kt - a.speed_kt),
        }),
        (one, None) | (None, one) => one,
    }
}

fn between(a: Option<f64>, b: Option<f64>, frac: f64) -> Option<f64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a + frac * (b - a)),
        (one, None) | (None, one) => one,
    }
}

/// The air at `altitude_ft` and `at_s` from the grid's hours round it:
/// each hour's column read at the altitude, then the two hours either
/// side of the time weighed by how near each is; the nearest hour's
/// outside them. An hour with nothing at the altitude gives way to the
/// other. Nothing for no hours.
pub fn aloft_at(hours: &[Hour], at_s: f64, altitude_ft: f64) -> Aloft {
    let mut sorted: Vec<&Hour> = hours.iter().collect();
    sorted.stable_sort_by(|a, b| a.valid_s.total_cmp(&b.valid_s));
    let (Some(first), Some(last)) = (sorted.first(), sorted.last()) else {
        return Aloft { wind: None, temp_c: None };
    };
    if at_s <= first.valid_s {
        return at_altitude(first, altitude_ft);
    }
    if at_s >= last.valid_s {
        return at_altitude(last, altitude_ft);
    }
    let Some(pair) = sorted.windows(2).find(|w| w[0].valid_s <= at_s && at_s <= w[1].valid_s) else {
        return at_altitude(last, altitude_ft);
    };
    let (a, b) = (at_altitude(pair[0], altitude_ft), at_altitude(pair[1], altitude_ft));
    let span = pair[1].valid_s - pair[0].valid_s;
    let frac = if span > 0.0 { (at_s - pair[0].valid_s) / span } else { 0.0 };
    Aloft { wind: between_winds(a.wind, b.wind, frac), temp_c: between(a.temp_c, b.temp_c, frac) }
}

fn opt_num(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn hours(name: &str, v: &Value) -> Result<Vec<Hour>, String> {
    let given = v.get("hours").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"hours\" is not a list"))?;
    given
        .iter()
        .map(|h| {
            let levels = h.get("levels").and_then(Value::as_array).ok_or_else(|| format!("{name}: an hour has no \"levels\""))?;
            let levels = levels
                .iter()
                .map(|l| {
                    Ok(Level {
                        altitude_ft: num(name, l, "altitude_ft")?,
                        u_kt: opt_num(name, l, "u_kt")?,
                        v_kt: opt_num(name, l, "v_kt")?,
                        temp_c: opt_num(name, l, "temp_c")?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(Hour { valid_s: num(name, h, "valid_s")?, levels })
        })
        .collect()
}

fn aloft_json(out: &mut String, a: Aloft) {
    out.push_str("{\"wind\":");
    match a.wind {
        Some(w) => {
            out.push_str("{\"wind_dir_true_deg\":");
            json::number(out, w.dir_true_deg);
            out.push_str(",\"wind_speed_kt\":");
            json::number(out, w.speed_kt);
            out.push('}');
        }
        None => out.push_str("null"),
    }
    out.push_str(",\"temp_c\":");
    json::opt_number(out, a.temp_c);
    out.push('}');
}

/// The rule, JSON in and out (call.rs): wind_aloft_at, for one altitude
/// ("altitude_ft") or many at once ("altitudes", a list in their order).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let given = hours(name, v)?;
    let at_s = num(name, v, "at_s")?;
    let mut out = String::new();
    match v.get("altitudes") {
        Some(Value::Array(alts)) => {
            out.push('[');
            for (i, a) in alts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let a = a.as_f64().ok_or_else(|| format!("{name}: an altitude is not a number"))?;
                aloft_json(&mut out, aloft_at(&given, at_s, a));
            }
            out.push(']');
        }
        _ => aloft_json(&mut out, aloft_at(&given, at_s, num(name, v, "altitude_ft")?)),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn level(ft: f64, dir: f64, kt: f64, temp: f64) -> Level {
        // The parts toward where it blows, as the store keeps them.
        let r = dir.to_radians();
        Level { altitude_ft: ft, u_kt: Some(-kt * r.sin()), v_kt: Some(-kt * r.cos()), temp_c: Some(temp) }
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn parts_turn_into_where_the_wind_blows_from() {
        let w = from_parts(10.0, 0.0);
        assert!(close(w.dir_true_deg, 270.0) && close(w.speed_kt, 10.0), "{w:?}");
        let n = from_parts(0.0, -20.0);
        assert!(close(n.dir_true_deg, 360.0) || close(n.dir_true_deg, 0.0), "{n:?}");
        assert_eq!(from_parts(0.0, 0.0).speed_kt, 0.0);
    }

    #[test]
    fn a_column_is_read_between_its_levels() {
        let hour = Hour { valid_s: 0.0, levels: vec![level(3000.0, 270.0, 10.0, 10.0), level(6000.0, 290.0, 20.0, 4.0)] };
        let a = at_altitude(&hour, 4500.0);
        let w = a.wind.unwrap();
        assert!(close(w.dir_true_deg, 280.0) && close(w.speed_kt, 15.0), "{w:?}");
        assert!(close(a.temp_c.unwrap(), 7.0));
    }

    #[test]
    fn a_level_under_the_ground_is_left_out() {
        let under = Level { altitude_ft: 6000.0, u_kt: None, v_kt: None, temp_c: None };
        let hour = Hour { valid_s: 0.0, levels: vec![under, level(9000.0, 250.0, 30.0, -3.0), level(12000.0, 250.0, 40.0, -9.0)] };
        let w = at_altitude(&hour, 8000.0).wind.unwrap();
        assert!(close(w.speed_kt, 30.0), "{w:?}");
    }

    #[test]
    fn hours_are_weighed_by_how_near_the_time_is() {
        let early = Hour { valid_s: 0.0, levels: vec![level(6000.0, 350.0, 10.0, 0.0)] };
        let late = Hour { valid_s: 7200.0, levels: vec![level(6000.0, 10.0, 30.0, -4.0)] };
        let mid = aloft_at(&[late.clone(), early.clone()], 1800.0, 6000.0);
        let w = mid.wind.unwrap();
        // A quarter of the way, the short way round through north.
        assert!(close(w.dir_true_deg, 355.0) && close(w.speed_kt, 15.0), "{w:?}");
        assert!(close(mid.temp_c.unwrap(), -1.0));
        assert_eq!(aloft_at(&[early.clone(), late.clone()], -50.0, 6000.0), at_altitude(&early, 6000.0));
        assert_eq!(aloft_at(&[early, late.clone()], 9000.0, 6000.0), at_altitude(&late, 6000.0));
        assert_eq!(aloft_at(&[], 0.0, 6000.0), Aloft { wind: None, temp_c: None });
    }
}
