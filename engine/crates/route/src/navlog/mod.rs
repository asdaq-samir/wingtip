//! The nav log: the planner's wingtip.navlog moved into the engine (#482
//! phase 4), so the planner, the web app and the phones fly one log.
//!
//! Dead reckoning a leg at a time, as the E6B does it (FAA-H-8083-25C,
//! PHAK ch. 16, "Dead reckoning" and "Wind triangle"): the true course and
//! distance between two fixes, the wind and temperature aloft at the leg's
//! altitude, the magnetic variation (east positive, magnetic = true -
//! variation), and from them the wind correction angle, the headings, the
//! ground speed, the time en route and the fuel -- the airplane flown in
//! the leg's own air (wingtip_flight::performance). On top of the legs:
//!
//! - legs: a leg and a run of them, their totals, the fuel plan (14 CFR
//!   91.151's reserve under VFR, 91.167's alternate and reserve under IFR)
//!   and the leg on to an IFR alternate;
//! - climbs: the climbs from the field and at every step up, each leg's
//!   time and fuel with them, and the tops of climb and descent (three to
//!   one, a ~3 degree path, down to the pattern or an approach's fix);
//! - plans: the four altitude plans -- lowest and highest over the legal
//!   band, fastest by the winds, economical by the fuel -- and the route
//!   flown at each altitude for the altitude wheel; a route with stops'
//!   plans joined from its hops';
//! - fuel_stop: whether a flight the tanks do not hold needs a stop, and
//!   the worst burn a mile and reserve its stops are looked for by;
//! - holds: a pilot's hold flown on the leg leaving its point (AIM 5-3-8),
//!   its minutes and fuel added, and the racetrack drawn.
//!
//! The engine never fetches: the winds, temperatures and variation each
//! leg is flown in come from the planner (`air`: per leg, its variation
//! and the wind and temperature at each altitude it may be flown at,
//! looked up at the leg's midpoint), and the legal altitudes from the
//! altitude selection. Compass deviation is not worked: it needs a
//! per-airplane deviation card the profiles do not carry.
//!
//! Legs go in and out as the planner's own JSON objects, members the log
//! does not know (a leg's `procedure`, `airway`, `hold`, `ground_min`)
//! carried through as they are.

pub mod calls;
pub mod change;
pub mod climbs;
pub mod descents;
pub mod fuel_stop;
pub mod holds;
pub mod legs;
pub mod plans;

use crate::json::Value;
use wingtip_flight::performance::Airplane;

pub(crate) type R<T> = Result<T, String>;

/// A JSON object, its members in order: a leg, a fix, a plan.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Obj(pub Vec<(String, Value)>);

impl Obj {
    pub fn read(name: &str, v: &Value) -> R<Obj> {
        match v {
            Value::Object(m) => Ok(Obj(m.clone())),
            _ => Err(format!("{name}: a leg or fix is not an object")),
        }
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Whether the member is there and not null.
    pub fn has(&self, key: &str) -> bool {
        !matches!(self.get(key), None | Some(Value::Null))
    }

    /// A number; None where missing or null.
    pub fn opt(&self, key: &str) -> R<Option<f64>> {
        match self.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Number(n)) => Ok(Some(*n)),
            Some(_) => Err(format!("\"{key}\" is not a number")),
        }
    }

    pub fn num(&self, key: &str) -> R<f64> {
        self.opt(key)?.ok_or_else(|| format!("\"{key}\" is missing"))
    }

    /// Python's truthiness of a number: there, and not zero.
    pub fn truthy(&self, key: &str) -> bool {
        match self.get(key) {
            Some(Value::Number(n)) => *n != 0.0,
            Some(Value::Bool(b)) => *b,
            Some(Value::String(s)) => !s.is_empty(),
            Some(Value::Array(a)) => !a.is_empty(),
            Some(Value::Object(o)) => !o.is_empty(),
            None | Some(Value::Null) => false,
        }
    }

    pub fn text(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Value::as_str)
    }

    pub fn set(&mut self, key: &str, v: Value) {
        match self.0.iter_mut().find(|(k, _)| k == key) {
            Some((_, slot)) => *slot = v,
            None => self.0.push((key.to_owned(), v)),
        }
    }

    pub fn set_num(&mut self, key: &str, v: f64) {
        self.set(key, number(v));
    }

    pub fn set_opt(&mut self, key: &str, v: Option<f64>) {
        self.set(key, v.map(number).unwrap_or(Value::Null));
    }

    pub fn value(self) -> Value {
        Value::Object(self.0)
    }
}

/// A number as JSON: not a number, or infinite, is null.
pub(crate) fn number(v: f64) -> Value {
    if v.is_finite() {
        Value::Number(v)
    } else {
        Value::Null
    }
}

pub(crate) fn object(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

pub(crate) fn opt_number(v: Option<f64>) -> Value {
    v.map(number).unwrap_or(Value::Null)
}

/// Python's round(v, places): the float nearest the exact binary value
/// rounded half to even, as the planner rounded every figure it wrote.
pub fn py_round(v: f64, places: usize) -> f64 {
    if !v.is_finite() {
        return v;
    }
    format!("{v:.places$}").parse().unwrap_or(v)
}

/// Python 3.12's sum() of floats: Neumaier's compensated sum, from 0.
pub fn py_sum(values: impl IntoIterator<Item = f64>) -> f64 {
    let (mut sum, mut c) = (0.0_f64, 0.0_f64);
    for x in values {
        let t = sum + x;
        if sum.abs() >= x.abs() {
            c += (sum - t) + x;
        } else {
            c += (x - t) + sum;
        }
        sum = t;
    }
    if c != 0.0 && c.is_finite() {
        sum += c;
    }
    sum
}

/// An airplane's profile as the nav log reads it: the performance model's
/// figures and the fuel's.
#[derive(Clone, Debug, Default)]
pub struct Profile {
    pub airplane: Airplane,
    /// Fuel for engine start, taxi and takeoff, where the profile gives it.
    pub taxi_fuel_gal: Option<f64>,
    pub usable_fuel_gal: Option<f64>,
    /// Whether the airplane carries oxygen or a pressurised cabin, which
    /// lets the plans go above 12,500 ft (14 CFR 91.211).
    pub oxygen: bool,
}

impl Profile {
    /// The profile from its JSON (data/aircraft/*.json with a pilot's own
    /// figures laid over it). A figure the log does not need for an answer
    /// may be missing; one it needs is asked for by `need`.
    pub fn read(name: &str, v: &Value) -> R<Profile> {
        let o = Obj::read(name, v).map_err(|_| format!("{name}: \"profile\" is not an object"))?;
        let opt = |k: &str| o.opt(k).map_err(|e| format!("{name}: the profile's {e}"));
        let truthy = |k: &str| o.truthy(k);
        Ok(Profile {
            airplane: Airplane {
                cruise_tas_kt: opt("cruise_tas_kt")?.unwrap_or(f64::NAN),
                fuel_burn_gph: opt("fuel_burn_gph")?.unwrap_or(f64::NAN),
                cruise_power_pct: opt("cruise_power_pct")?,
                cruise_altitude_ft: opt("cruise_altitude_ft")?,
                climb_tas_kt: opt("climb_tas_kt")?,
                climb_fuel_burn_gph: opt("climb_fuel_burn_gph")?,
                climb_rate_fpm_sea_level: opt("climb_rate_fpm_sea_level")?,
                service_ceiling_ft: opt("service_ceiling_ft")?.unwrap_or(f64::NAN),
            },
            taxi_fuel_gal: opt("taxi_fuel_gal")?,
            usable_fuel_gal: opt("usable_fuel_gal")?,
            oxygen: truthy("supplemental_oxygen") || truthy("pressurized"),
        })
    }

    /// An error naming the first of the figures `keys` the profile lacks.
    pub fn need(&self, name: &str, keys: &[&str]) -> R<()> {
        for key in keys {
            let v = match *key {
                "cruise_tas_kt" => self.airplane.cruise_tas_kt,
                "fuel_burn_gph" => self.airplane.fuel_burn_gph,
                "service_ceiling_ft" => self.airplane.service_ceiling_ft,
                _ => 0.0,
            };
            if v.is_nan() {
                return Err(format!("{name}: the profile has no \"{key}\""));
            }
        }
        Ok(())
    }
}

/// The air a leg is flown in at one altitude, as the planner looked it up
/// at the leg's midpoint: the wind (`{"wind_dir_true_deg",
/// "wind_speed_kt", ...}`, the direction it blows from, carried onto the
/// leg as it is) or null where no winds-aloft station was near, and the
/// temperature, None where none was (a standard day is flown).
#[derive(Clone, Debug, PartialEq)]
pub struct Air {
    pub wind: Value,
    pub oat_c: Option<f64>,
}

/// A leg's air: its magnetic variation, and its air at each altitude it
/// may be flown at.
#[derive(Clone, Debug, Default)]
pub struct LegAir {
    pub variation_deg: f64,
    pub at: Vec<(f64, Air)>,
}

impl LegAir {
    pub fn at(&self, name: &str, i: usize, altitude_ft: f64) -> R<&Air> {
        self.at
            .iter()
            .find(|(ft, _)| *ft == altitude_ft)
            .map(|(_, a)| a)
            .ok_or_else(|| format!("{name}: no air was given for leg {i} at {altitude_ft} ft"))
    }
}

pub(crate) fn read_air(name: &str, v: &Value) -> R<Air> {
    let wind = match v.get("wind") {
        None | Some(Value::Null) => Value::Null,
        Some(w @ Value::Object(_)) => w.clone(),
        Some(_) => return Err(format!("{name}: a wind is not an object")),
    };
    let oat_c = match v.get("oat_c") {
        None | Some(Value::Null) => None,
        Some(Value::Number(n)) => Some(*n),
        Some(_) => return Err(format!("{name}: \"oat_c\" is not a number")),
    };
    Ok(Air { wind, oat_c })
}

/// `air`: `[{"variation_deg", "at": [{"altitude_ft", "wind", "oat_c"}]}]`,
/// one a leg.
pub(crate) fn read_leg_air(name: &str, v: &Value) -> R<Vec<LegAir>> {
    let list = match v.get("air") {
        Some(Value::Array(items)) => items,
        _ => return Err(format!("{name}: \"air\" is missing or not a list")),
    };
    list.iter()
        .map(|leg| {
            let o = Obj::read(name, leg)?;
            let at = match leg.get("at") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Array(items)) => items
                    .iter()
                    .map(|a| {
                        let ft = Obj::read(name, a)?.num("altitude_ft").map_err(|e| format!("{name}: {e}"))?;
                        Ok((ft, read_air(name, a)?))
                    })
                    .collect::<R<Vec<_>>>()?,
                Some(_) => return Err(format!("{name}: a leg's \"at\" is not a list")),
            };
            Ok(LegAir { variation_deg: o.num("variation_deg").map_err(|e| format!("{name}: {e}"))?, at })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounding_is_pythons() {
        assert_eq!(py_round(2.675, 2), 2.67);
        assert_eq!(py_round(0.25, 1), 0.2);
        assert_eq!(py_round(0.35, 1), 0.3);
        assert_eq!(py_round(28.75, 1), 28.8);
        assert_eq!(py_sum([0.1, 0.2, 0.3]), 0.6);
    }
}
