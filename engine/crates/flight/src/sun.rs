//! Night, for the fuel reserve and every rule that asks it: 14 CFR 1.1
//! defines night as "the time between the end of evening civil twilight
//! and the beginning of morning civil twilight, as published in the Air
//! Almanac, converted to local time", and civil twilight ends and begins
//! with the sun's centre six degrees below the horizon (the Air Almanac's
//! and the Naval Observatory's definition). 91.151(a)(2) holds a VFR
//! flight at night to 45 minutes of fuel, where it is 30 by day.
//!
//! The sun's place is NOAA's solar calculation (the Global Monitoring
//! Laboratory's "NOAA Solar Calculator" and its spreadsheet, after Meeus,
//! Astronomical Algorithms). It replaced the planner's wingtip.sun, which
//! asked astral the same question (#482): over 400 random points and days
//! of 2026 between 19 and 60 degrees north across the US the two agree on
//! dawn and dusk to 0.7 minutes at the median and 2.1 at the 90th
//! percentile, the worst 3.9 minutes near 59 degrees north in August,
//! where the sun's path grazes six degrees below the horizon and a sliver
//! of a degree is minutes (scratch comparison, 2026-11-08).
//!
//! The rule's own text says "converted to local time"; the planner works
//! in UTC throughout, so the instants here are UNIX seconds, UTC.
//!
//! 61.57(b)'s night currency binds in a different window, "the period
//! beginning 1 hour after sunset and ending 1 hour before sunrise", from
//! sunset and sunrise rather than civil twilight (`passenger_night`). In
//! the lower 48 that window lies inside 1.1's night, but where civil
//! twilight lasts all night -- Anchorage (61.2 N) at the June solstice,
//! the sun no lower than about 5.4 degrees down -- there is no 1.1 night
//! at all while 61.57(b)'s window still runs from about 00:40 to 03:20
//! local, so the two are worked out apart.

/// Civil twilight: the sun's centre six degrees below the horizon (14 CFR
/// 1.1's "civil twilight", as the Air Almanac publishes it), a zenith
/// distance of 96 degrees.
pub const CIVIL_DEPRESSION_DEG: f64 = 6.0;

/// Sunrise and sunset: the sun's upper limb on the horizon, its centre
/// 0.833 degrees down (34 minutes of refraction and 16 of semi-diameter;
/// NOAA's Solar Calculator, the Naval Observatory's definition), a zenith
/// distance of 90.833 degrees.
pub const SUNRISE_DEPRESSION_DEG: f64 = 0.833;

/// 14 CFR 61.57(b): the night-passenger period begins 1 hour after sunset
/// and ends 1 hour before sunrise, s.
pub const PASSENGER_NIGHT_MARGIN_S: f64 = 3600.0;

const DAY_S: f64 = 86_400.0;

/// The sun's declination and the equation of time at an instant: NOAA's
/// spreadsheet (Julian century from J2000.0, Meeus ch. 25's low-precision
/// solar coordinates with the nutation's main term).
fn sun_at(unix_s: f64) -> (f64, f64) {
    let jd = unix_s / DAY_S + 2_440_587.5;
    let t = (jd - 2_451_545.0) / 36_525.0;
    let l0 = (280.46646 + t * (36_000.769_83 + t * 0.0003032)).rem_euclid(360.0);
    let m = 357.52911 + t * (35_999.050_29 - 0.0001537 * t);
    let e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    let mr = m.to_radians();
    let c =
        mr.sin() * (1.914602 - t * (0.004817 + 0.000014 * t)) + (2.0 * mr).sin() * (0.019993 - 0.000101 * t) + (3.0 * mr).sin() * 0.000289;
    let true_long = l0 + c;
    let omega = (125.04 - 1934.136 * t).to_radians();
    let apparent_long = true_long - 0.00569 - 0.00478 * omega.sin();
    let mean_obliquity = 23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0;
    let obliquity = (mean_obliquity + 0.00256 * omega.cos()).to_radians();
    let declination = (obliquity.sin() * apparent_long.to_radians().sin()).asin();
    let y = (obliquity / 2.0).tan().powi(2);
    let l0r = l0.to_radians();
    let eq_time_min = 4.0
        * (y * (2.0 * l0r).sin() - 2.0 * e * mr.sin() + 4.0 * e * y * mr.sin() * (2.0 * l0r).cos()
            - 0.5 * y * y * (4.0 * l0r).sin()
            - 1.25 * e * e * (2.0 * mr).sin())
        .to_degrees();
    (declination, eq_time_min)
}

/// The sun's hour angle when its centre is `depression` degrees below the
/// horizon, degrees, at a latitude on a declination; Err(true) where the
/// sun stays further down all day (a polar night), Err(false) where it
/// never goes that far down (a polar summer's day).
fn twilight_hour_angle(lat: f64, declination: f64, depression: f64) -> Result<f64, bool> {
    let lat = lat.to_radians();
    let zenith = (90.0 + depression).to_radians();
    let cos_ha = zenith.cos() / (lat.cos() * declination.cos()) - lat.tan() * declination.tan();
    if cos_ha > 1.0 {
        Err(true)
    } else if cos_ha < -1.0 {
        Err(false)
    } else {
        Ok(cos_ha.acos().to_degrees())
    }
}

/// The instant of solar noon at a longitude (east positive) nearest to
/// `near_s`, UNIX seconds.
fn solar_noon(lon: f64, near_s: f64) -> f64 {
    // The day's 00:00 UTC, then noon there: 720 minutes less four a degree
    // of east longitude, less the equation of time (NOAA's).
    let mut noon = (near_s / DAY_S).floor() * DAY_S + (720.0 - 4.0 * lon) * 60.0;
    for _ in 0..2 {
        let (_, eq) = sun_at(noon);
        let base = ((near_s - (720.0 - 4.0 * lon - eq) * 60.0) / DAY_S).round() * DAY_S;
        noon = base + (720.0 - 4.0 * lon - eq) * 60.0;
    }
    noon
}

/// One civil day at a point: its dawn and dusk (UNIX seconds, the morning
/// and evening ends of civil twilight round the solar noon `noon_s`), or
/// for a polar day, whether it is night all day (`Err(true)`) or day all
/// day (`Err(false)`).
fn civil_day(lat: f64, lon: f64, noon_s: f64) -> Result<(f64, f64), bool> {
    sun_day(lat, lon, noon_s, CIVIL_DEPRESSION_DEG)
}

/// The two instants round the solar noon `noon_s` when the sun's centre is
/// `depression` degrees below the horizon (civil twilight's ends at six,
/// sunrise and sunset at 0.833), or Err as twilight_hour_angle says.
fn sun_day(lat: f64, lon: f64, noon_s: f64, depression: f64) -> Result<(f64, f64), bool> {
    // Each end worked out at the sun's place at that end, twice over: the
    // declination moves up to a third of a degree in the half day.
    let end = |sign: f64| -> Result<f64, bool> {
        let mut at = noon_s;
        for _ in 0..3 {
            let (decl, eq) = sun_at(at);
            let ha = twilight_hour_angle(lat, decl, depression)?;
            let noon = (noon_s / DAY_S).floor() * DAY_S + (720.0 - 4.0 * lon - eq) * 60.0;
            // A noon that the floor put on the day before or after: the
            // nearest to the one asked for.
            let noon = noon + ((noon_s - noon) / DAY_S).round() * DAY_S;
            at = noon + sign * 4.0 * ha * 60.0;
        }
        Ok(at)
    };
    Ok((end(-1.0)?, end(1.0)?))
}

/// Whether an instant (UNIX seconds) is night at a point (14 CFR 1.1):
/// outside the civil twilight of the civil day round it.
pub fn is_night(lat: f64, lon: f64, at_s: f64) -> bool {
    let noon = solar_noon(lon, at_s);
    match civil_day(lat, lon, noon) {
        Ok((dawn, dusk)) => !(dawn <= at_s && at_s <= dusk),
        Err(night_all_day) => night_all_day,
    }
}

/// Whether the sun is down at a point (after sunset, before sunrise: its
/// centre SUNRISE_DEPRESSION_DEG below the horizon), read on the day whose
/// solar noon is nearest. Not 1.1's night, which waits for civil
/// twilight's end: the sky as it looks, for a picture's day or night
/// glyph (the map's weather bubble). Where the sun does not set, never;
/// where it does not rise, always.
pub fn sun_down(lat: f64, lon: f64, at_s: f64) -> bool {
    let noon = solar_noon(lon, at_s);
    match sun_day(lat, lon, noon, SUNRISE_DEPRESSION_DEG) {
        Ok((sunrise, sunset)) => at_s < sunrise || at_s > sunset,
        Err(night_all_day) => night_all_day,
    }
}

/// Whether an instant is in 14 CFR 61.57(b)'s night-passenger period at a
/// point: "beginning 1 hour after sunset and ending 1 hour before
/// sunrise", read on the day whose solar noon is nearest (so after local
/// midnight it is the next sunrise that counts). Its own window, not 1.1's
/// night (the module's note): true at Anchorage at 02:00 local on the June
/// solstice, where is_night is false. Where the sun does not set at all it
/// is never in it; where it does not rise, always.
pub fn passenger_night(lat: f64, lon: f64, at_s: f64) -> bool {
    let noon = solar_noon(lon, at_s);
    match sun_day(lat, lon, noon, SUNRISE_DEPRESSION_DEG) {
        Ok((sunrise, sunset)) => at_s < sunrise - PASSENGER_NIGHT_MARGIN_S || at_s > sunset + PASSENGER_NIGHT_MARGIN_S,
        Err(night_all_day) => night_all_day,
    }
}

/// How often a flight's way is looked at for the night: every half hour,
/// the planner's own figure (the sun's twilight moves no faster along a
/// light airplane's track than its own few minutes an hour).
pub const NIGHT_STEP_MIN: f64 = 30.0;

/// Whether any of a trip from `start` to `end` (lat, lon) of `minutes`,
/// its stops' time on the ground counted, leaving at `depart_s`, falls in
/// the night, judged every NIGHT_STEP_MIN at where it is by then along
/// the straight line: a stop's flight landing after dark is held to 14
/// CFR 91.151(a)(2)'s 45 minutes, which the one long flight, day at both
/// its ends, was not.
pub fn night_on_the_way(start: (f64, f64), end: (f64, f64), depart_s: f64, minutes: f64) -> bool {
    on_the_way(start, end, depart_s, minutes, is_night)
}

/// Whether any of a flight from `start` to `end` of `minutes`, leaving at
/// `depart_s`, falls in 61.57(b)'s night-passenger period (passenger_night),
/// judged as night_on_the_way judges the night: the rule binds the pilot
/// in command carrying passengers in any of that period, not only at its
/// takeoffs and landings.
pub fn passenger_night_on_the_way(start: (f64, f64), end: (f64, f64), depart_s: f64, minutes: f64) -> bool {
    on_the_way(start, end, depart_s, minutes, passenger_night)
}

fn on_the_way(start: (f64, f64), end: (f64, f64), depart_s: f64, minutes: f64, test: fn(f64, f64, f64) -> bool) -> bool {
    let steps = ((minutes / NIGHT_STEP_MIN).floor() as i64 + 1).max(1);
    (0..=steps).any(|k| {
        let at = if minutes > 0.0 { (k as f64 * NIGHT_STEP_MIN).min(minutes) / minutes } else { 0.0 };
        let (lat, lon) = (start.0 + (end.0 - start.0) * at, start.1 + (end.1 - start.1) * at);
        test(lat, lon, depart_s + at * minutes * 60.0)
    })
}

/// Whether a flight is at night at either end: leaving `start` at
/// `depart_s` or arriving at `end` at `arrive_s` (91.151's reserve, the
/// planner's and route options' reading of a flight "at night").
pub fn night_at_either_end(start: (f64, f64), depart_s: f64, end: (f64, f64), arrive_s: f64) -> bool {
    is_night(start.0, start.1, depart_s) || is_night(end.0, end.1, arrive_s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> f64 {
        // Days from 1970-01-01 by the civil calendar (Howard Hinnant's).
        let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let doy = (153 * m + 2) / 5 + d - 1;
        let doe = yoe as u32 * 365 + yoe as u32 / 4 - yoe as u32 / 100 + doy;
        let days = era as i64 * 146_097 + doe as i64 - 719_468;
        (days * 86_400 + h as i64 * 3600 + min as i64 * 60) as f64
    }

    #[test]
    fn chicago_civil_twilight_on_the_equinox_within_two_minutes_of_astral() {
        // astral 3 (what wingtip.sun asked), Chicago 41.88 N 87.63 W,
        // 2026-03-20: dawn 11:25:34 UTC, dusk 00:29:50 UTC on the 21st.
        let (dawn, dusk) = civil_day(41.88, -87.63, solar_noon(-87.63, utc(2026, 3, 20, 12, 0))).unwrap();
        assert!((dawn - 1_774_005_934.0).abs() <= 120.0);
        assert!((dusk - 1_774_052_989.0).abs() <= 120.0);
        assert_eq!(utc(2026, 3, 20, 0, 0), 1_773_964_800.0);
    }

    #[test]
    fn the_sun_is_down_from_sunset_not_from_civil_twilight() {
        // Chicago on the 2026 equinox: sunset about 00:03 UTC on the 21st.
        assert!(!sun_down(41.88, -87.63, utc(2026, 3, 20, 18, 0)));
        assert!(!sun_down(41.88, -87.63, utc(2026, 3, 20, 23, 50)));
        // Twenty minutes after sunset: down, though not yet 1.1's night.
        assert!(sun_down(41.88, -87.63, utc(2026, 3, 21, 0, 20)));
        assert!(!is_night(41.88, -87.63, utc(2026, 3, 21, 0, 20)));
        assert!(sun_down(41.88, -87.63, utc(2026, 3, 21, 8, 0)));
    }

    #[test]
    fn night_is_outside_civil_twilight() {
        assert!(!is_night(41.88, -87.63, utc(2026, 3, 20, 18, 0)));
        assert!(is_night(41.88, -87.63, utc(2026, 3, 21, 3, 0)));
        // Sunset is about 00:03 UTC; twenty minutes after it is still
        // civil twilight, not night.
        assert!(!is_night(41.88, -87.63, utc(2026, 3, 21, 0, 20)));
        assert!(is_night(41.88, -87.63, utc(2026, 3, 21, 0, 40)));
    }

    #[test]
    fn polar_days_are_night_or_day_all_day() {
        // At 85 N the sun stays more than six degrees down all of the
        // December solstice and never goes that far down at the June one.
        assert!(is_night(85.0, 0.0, utc(2026, 12, 21, 12, 0)));
        assert!(!is_night(85.0, 0.0, utc(2026, 6, 21, 0, 0)));
        assert_eq!(civil_day(85.0, 0.0, solar_noon(0.0, utc(2026, 12, 21, 12, 0))), Err(true));
    }

    #[test]
    fn anchorage_at_the_june_solstice_has_no_civil_night_but_a_61_57_b_one() {
        // Anchorage, 61.22 N 149.90 W, the night of 21-22 June 2026: the
        // sun's lowest is about 61.2 + 23.4 - 90 = -5.4 degrees, inside
        // civil twilight, so no 14 CFR 1.1 night; sunset is about 23:42
        // AKDT (07:42 UTC on the 22nd) and sunrise about 04:21 AKDT (12:21
        // UTC), so 61.57(b)'s period runs from about 08:42 to 11:21 UTC.
        let (lat, lon) = (61.22, -149.90);
        let at = utc(2026, 6, 22, 10, 0);
        assert!(!is_night(lat, lon, at));
        assert!(passenger_night(lat, lon, at));
        // Half an hour after sunset, and half an hour before sunrise: not yet, and no longer.
        assert!(!passenger_night(lat, lon, utc(2026, 6, 22, 8, 15)));
        assert!(!passenger_night(lat, lon, utc(2026, 6, 22, 11, 50)));
        // Midday is day by either rule.
        assert!(!passenger_night(lat, lon, utc(2026, 6, 21, 22, 0)));
    }

    #[test]
    fn chicago_61_57_b_starts_an_hour_after_sunset() {
        // Chicago on the March equinox: sunset about 00:03 UTC on the 21st
        // (astral, as the civil-twilight test above), so 1.1's night has
        // begun by 00:40 while 61.57(b)'s period begins only about 01:03.
        let (lat, lon) = (41.88, -87.63);
        assert!(is_night(lat, lon, utc(2026, 3, 21, 0, 40)));
        assert!(!passenger_night(lat, lon, utc(2026, 3, 21, 0, 50)));
        assert!(passenger_night(lat, lon, utc(2026, 3, 21, 1, 15)));
        assert!(passenger_night(lat, lon, utc(2026, 3, 21, 6, 0)));
        assert!(!passenger_night(lat, lon, utc(2026, 3, 20, 18, 0)));
    }

    #[test]
    fn a_long_trip_west_into_the_evening_meets_the_night() {
        let leave = utc(2026, 3, 20, 20, 0);
        assert!(night_on_the_way((41.88, -87.63), (39.74, -104.99), leave, 600.0));
        assert!(!night_on_the_way((41.88, -87.63), (39.74, -104.99), leave, 120.0));
    }
}
