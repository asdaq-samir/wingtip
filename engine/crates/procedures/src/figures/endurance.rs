//! An airplane's endurance: how long its usable fuel lasts at its cruise
//! burn, and how long of that is left to fly once the reserve the rules
//! ask is kept back. The reserve is 14 CFR 91.151(a)'s by day (30 minutes
//! at normal cruise) and by night (45), and 91.167(a)(3)'s under IFR (45),
//! as wingtip_flight::flight::reserve_min holds them. A figure under the
//! reserve is given with a flag, never refused: the pilot is warned, not
//! limited.

use crate::flight::reserve_min;
use crate::json::{self, Value};

/// Which reserve applies to the endurance.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reserve {
    /// VFR by day, 91.151(a)(1): 30 minutes.
    VfrDay,
    /// VFR at night, 91.151(a)(2): 45 minutes.
    VfrNight,
    /// IFR, 91.167(a)(3): 45 minutes.
    Ifr,
    /// None kept back: the whole tanks' time.
    None,
}

impl Reserve {
    fn minutes(self) -> f64 {
        match self {
            Reserve::VfrDay => reserve_min(false, false),
            Reserve::VfrNight => reserve_min(false, true),
            Reserve::Ifr => reserve_min(true, false),
            Reserve::None => 0.0,
        }
    }
}

/// The endurance worked out from the airplane's own figures.
#[derive(Clone, Debug, PartialEq)]
pub struct Endurance {
    /// Usable fuel over burn, minutes; None without both.
    pub minutes: Option<f64>,
    /// The reserve kept back, minutes.
    pub reserve_min: f64,
    /// The reserve's fuel at the burn, gallons; None without a burn.
    pub reserve_gal: Option<f64>,
    /// The minutes left once the reserve is kept, never below zero.
    pub after_reserve_min: Option<f64>,
    /// Whether the usable fuel lasts less than the reserve alone.
    pub below_reserve: bool,
}

/// The endurance of `usable_gal` at `burn_gph` with `reserve` kept back.
/// A missing or non-positive figure gives None, never a stock airplane's.
pub fn endurance(usable_gal: Option<f64>, burn_gph: Option<f64>, reserve: Reserve) -> Endurance {
    let usable = usable_gal.filter(|u| *u >= 0.0);
    let burn = burn_gph.filter(|b| *b > 0.0);
    let minutes = usable.zip(burn).map(|(u, b)| u / b * 60.0);
    let reserve_min = reserve.minutes();
    Endurance {
        minutes,
        reserve_min,
        reserve_gal: burn.map(|b| reserve_min / 60.0 * b),
        after_reserve_min: minutes.map(|m| (m - reserve_min).max(0.0)),
        below_reserve: minutes.is_some_and(|m| m < reserve_min),
    }
}

fn opt_num(v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("endurance: \"{key}\" is not a number")),
    }
}

/// The rule `endurance`: `{"usable_gal"?, "burn_gph"?, "reserve":
/// "vfr_day"|"vfr_night"|"ifr"|"none"}` to `{"minutes",
/// "reserve_min", "reserve_gal", "after_reserve_min", "below_reserve"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "endurance" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let reserve = match v.get("reserve").and_then(Value::as_str) {
        Some("vfr_day") => Reserve::VfrDay,
        Some("vfr_night") => Reserve::VfrNight,
        Some("ifr") => Reserve::Ifr,
        Some("none") => Reserve::None,
        _ => return Err("endurance: \"reserve\" is vfr_day, vfr_night, ifr or none".to_owned()),
    };
    let e = endurance(opt_num(v, "usable_gal")?, opt_num(v, "burn_gph")?, reserve);
    let mut out = String::from("{\"minutes\":");
    json::opt_number(&mut out, e.minutes);
    out.push_str(",\"reserve_min\":");
    json::number(&mut out, e.reserve_min);
    out.push_str(",\"reserve_gal\":");
    json::opt_number(&mut out, e.reserve_gal);
    out.push_str(",\"after_reserve_min\":");
    json::opt_number(&mut out, e.after_reserve_min);
    out.push_str(",\"below_reserve\":");
    out.push_str(if e.below_reserve { "true" } else { "false" });
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fifty_three_gallons_at_ten_an_hour_is_318_minutes_and_273_after_ifrs_45() {
        let e = endurance(Some(53.0), Some(10.0), Reserve::Ifr);
        assert!((e.minutes.unwrap() - 318.0).abs() < 1e-9);
        assert_eq!(e.reserve_min, 45.0);
        assert!((e.reserve_gal.unwrap() - 7.5).abs() < 1e-9);
        assert!((e.after_reserve_min.unwrap() - 273.0).abs() < 1e-9);
        assert!(!e.below_reserve);
    }

    #[test]
    fn day_vfr_keeps_30_minutes_and_night_vfr_45() {
        assert_eq!(endurance(Some(40.0), Some(8.0), Reserve::VfrDay).after_reserve_min, Some(270.0));
        assert_eq!(endurance(Some(40.0), Some(8.0), Reserve::VfrNight).after_reserve_min, Some(255.0));
        assert_eq!(endurance(Some(40.0), Some(8.0), Reserve::None).after_reserve_min, Some(300.0));
    }

    #[test]
    fn under_the_reserve_is_flagged_and_left_at_zero_never_refused() {
        let e = endurance(Some(3.0), Some(8.0), Reserve::VfrDay);
        assert_eq!(e.minutes, Some(22.5));
        assert_eq!(e.after_reserve_min, Some(0.0));
        assert!(e.below_reserve);
    }

    #[test]
    fn no_burn_or_no_fuel_is_no_figure() {
        let e = endurance(None, Some(8.0), Reserve::Ifr);
        assert_eq!((e.minutes, e.after_reserve_min, e.below_reserve), (None, None, false));
        assert_eq!(e.reserve_gal, Some(6.0));
        assert_eq!(endurance(Some(40.0), None, Reserve::Ifr).minutes, None);
        assert_eq!(endurance(Some(40.0), Some(0.0), Reserve::Ifr).minutes, None);
    }

    #[test]
    fn the_call_reads_and_writes_json() {
        let v = json::parse(r#"{"usable_gal": 53, "burn_gph": 10, "reserve": "vfr_night"}"#).unwrap();
        assert_eq!(
            call("endurance", &v).unwrap(),
            r#"{"minutes":318.0,"reserve_min":45.0,"reserve_gal":7.5,"after_reserve_min":273.0,"below_reserve":false}"#
        );
        assert!(call("endurance", &json::parse(r#"{"reserve": "sometimes"}"#).unwrap()).is_err());
    }
}
