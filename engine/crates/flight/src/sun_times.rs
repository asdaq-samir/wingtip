//! A day's sun at a point as times, for a pilot to read: the instants
//! sun.rs judges night by, said once for the day rather than asked of an
//! instant. Sunrise and sunset are the sun's upper limb on the horizon
//! (SUNRISE_DEPRESSION_DEG), civil twilight's ends its centre six degrees
//! down (CIVIL_DEPRESSION_DEG), NOAA's solar calculation as sun.rs has it;
//! the Naval Observatory's tables (aa.usno.navy.mil) agree to the minute
//! or two its accuracy note gives.
//!
//! The periods the rules read from them, each the one that begins on the
//! evening of the day asked and ends the next morning:
//!
//! - 14 CFR 1.1's night: "the time between the end of evening civil
//!   twilight and the beginning of morning civil twilight" -- what
//!   91.151(a)(2)'s 45-minute reserve and 91.205(c)'s equipment mean by
//!   night;
//! - 61.57(b)'s period, "beginning 1 hour after sunset and ending 1 hour
//!   before sunrise": a pilot carries passengers in it only with three
//!   takeoffs and landings to a full stop made in it within 90 days, so
//!   both its currency and its passengers are read here, not by 1.1's night;
//! - 91.209(a)'s position lights: "from sunset to sunrise" (in Alaska also
//!   while the sun is more than six degrees down or an unlighted object
//!   cannot be seen from 3 sm, which sunset to sunrise already holds for
//!   the sun's part, as sun.rs's lights_on says).
//!
//! The day is the pilot's local one, read at the longitude's own mean
//! noon (four minutes a degree from Greenwich): the solar noon nearest it
//! is the day's, so a date west of Greenwich is not read as the UTC day's.

use crate::sun::{solar_noon, sun_day, CIVIL_DEPRESSION_DEG, DAY_S, PASSENGER_NIGHT_MARGIN_S, SUNRISE_DEPRESSION_DEG};
use wingtip_core::ask::Ask;
use wingtip_core::json::{self, Value};
use wingtip_core::time::{days_from_civil, parse_date_loose};

/// Two instants of a day (UNIX seconds), or why there are none: `Err(true)`
/// the sun stays further down all day, `Err(false)` it never goes that far.
type Ends = Result<(f64, f64), bool>;

/// The day's sun at a point: its solar noon, its sunrise and sunset, its
/// civil twilight's ends, and the next day's, for the evening's periods.
pub struct SunDay {
    pub noon_s: f64,
    pub sun: Ends,
    pub civil: Ends,
    pub next_sun: Ends,
    pub next_civil: Ends,
}

/// The sun at (lat, lon) on the local date `days` (days since 1970-01-01).
pub fn sun_day_of(lat: f64, lon: f64, days: i64) -> SunDay {
    let mean_noon = days as f64 * DAY_S + (720.0 - 4.0 * lon) * 60.0;
    let noon_s = solar_noon(lon, mean_noon);
    let next = noon_s + DAY_S;
    SunDay {
        noon_s,
        sun: sun_day(lat, lon, noon_s, SUNRISE_DEPRESSION_DEG),
        civil: sun_day(lat, lon, noon_s, CIVIL_DEPRESSION_DEG),
        next_sun: sun_day(lat, lon, next, SUNRISE_DEPRESSION_DEG),
        next_civil: sun_day(lat, lon, next, CIVIL_DEPRESSION_DEG),
    }
}

/// How a day's two instants come out: "both", "never_down" (the sun never
/// goes that far below the horizon) or "never_up" (it never comes above it).
fn kind(ends: &Ends) -> &'static str {
    match ends {
        Ok(_) => "both",
        Err(false) => "never_down",
        Err(true) => "never_up",
    }
}

fn morning(ends: &Ends) -> Option<f64> {
    ends.ok().map(|(m, _)| m)
}

fn evening(ends: &Ends) -> Option<f64> {
    ends.ok().map(|(_, e)| e)
}

/// A period from this evening to the next morning, as {"from_s",
/// "until_s"}: each null where the sun does not cross that line then. A day
/// it never comes up is all night: "all_day" true and both null.
fn period(out: &mut String, today: &Ends, next: &Ends, margin_s: f64) {
    out.push_str("{\"from_s\":");
    json::opt_number(out, evening(today).map(|e| e + margin_s));
    out.push_str(",\"until_s\":");
    json::opt_number(out, morning(next).map(|m| m - margin_s));
    out.push_str(",\"all_day\":");
    out.push_str(if matches!(today, Err(true)) { "true" } else { "false" });
    out.push('}');
}

/// The local date "yyyy-mm-dd" as days since 1970-01-01.
fn date_days(name: &str, date: &str) -> Result<i64, String> {
    let (y, m, d) = parse_date_loose(date).ok_or_else(|| format!("{name}: \"date\" is not a date, yyyy-mm-dd: {date:?}"))?;
    Ok(days_from_civil(y, m, d))
}

/// sun_times, asked by name.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let (lat, lon) = (ask.num("lat")?, ask.num("lon")?);
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return Err(format!("{name}: lat {lat}, lon {lon} is not a place on the earth"));
    }
    let day = sun_day_of(lat, lon, date_days(name, ask.str("date")?)?);
    let mut out = String::from("{\"solar_noon_s\":");
    json::number(&mut out, day.noon_s);
    out.push_str(",\"sun\":");
    json::string(&mut out, kind(&day.sun));
    out.push_str(",\"sunrise_s\":");
    json::opt_number(&mut out, morning(&day.sun));
    out.push_str(",\"sunset_s\":");
    json::opt_number(&mut out, evening(&day.sun));
    out.push_str(",\"civil_twilight\":");
    json::string(&mut out, kind(&day.civil));
    out.push_str(",\"civil_dawn_s\":");
    json::opt_number(&mut out, morning(&day.civil));
    out.push_str(",\"civil_dusk_s\":");
    json::opt_number(&mut out, evening(&day.civil));
    out.push_str(",\"night\":");
    period(&mut out, &day.civil, &day.next_civil, 0.0);
    out.push_str(",\"passenger_night\":");
    period(&mut out, &day.sun, &day.next_sun, PASSENGER_NIGHT_MARGIN_S);
    out.push_str(",\"lights\":");
    period(&mut out, &day.sun, &day.next_sun, 0.0);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_date_that_is_not_one_is_refused() {
        assert!(date_days("sun_times", "2026-02-30").is_err());
        assert!(date_days("sun_times", "2026-3-20").is_ok());
        assert!(date_days("sun_times", "20 March").is_err());
    }

    #[test]
    fn chicagos_equinox_evening_is_the_20th_local_not_the_utc_day() {
        // USNO, 41.88 N 87.63 W: sunset 00:03 UTC on 2026-03-21.
        let day = sun_day_of(41.88, -87.63, days_from_civil(2026, 3, 20));
        let (_, sunset) = day.sun.unwrap();
        assert!((sunset - 1_774_051_380.0).abs() <= 180.0);
    }
}
