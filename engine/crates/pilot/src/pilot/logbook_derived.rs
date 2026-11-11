//! What a logbook file read gives this logbook's track columns (V34)
//! that ForeFlight keeps in other shapes: the air time out of its wheels
//! off and on, the touch-and-goes out of its landings.
//!
//! Air time (takeoff roll to landing roll) is no part of 14 CFR 61.51's
//! logbook: 61.51(b)(1)(ii) asks the total flight time, which 14 CFR 1.1 starts when
//! the airplane first moves under its own power to fly and ends when it
//! comes to rest after landing. So a file that gives no air time is read
//! as none known (0), never as the flight time, which would claim more
//! than the pilot wrote.

use super::js;

/// A time of day as ForeFlight's "hhmm" columns hold it ("1430", "14:30",
/// "930", "1430Z"), as minutes since midnight; None for anything else.
fn minutes(v: &str) -> Option<f64> {
    let s = js::trim(v).trim_end_matches(['Z', 'z']);
    let digits: String = s.chars().filter(|c| *c != ':').collect();
    if !(3..=4).contains(&digits.len()) || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (h, m) = digits.split_at(digits.len() - 2);
    let (h, m): (f64, f64) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24.0 && m < 60.0).then_some(h * 60.0 + m)
}

/// The air time ForeFlight's TimeOff and TimeOn give, in hours to the
/// tenth, past midnight where on is before off; never more than the
/// flight time, which holds it (1.1). None where either is missing.
pub fn air_hours(off: Option<&str>, on: Option<&str>, total: f64) -> Option<f64> {
    let (off, on) = (minutes(off?)?, minutes(on?)?);
    let flown = (on - off).rem_euclid(24.0 * 60.0) / 60.0;
    Some((js::round(flown * 10.0) / 10.0).min(total))
}

/// The touch-and-goes among ForeFlight's landings: every landing
/// (AllLandings) less those to a full stop by day and at night, where the
/// file gives all three's columns; 61.57(a) counts them, 61.57(b) not.
pub fn touch_and_goes(all: Option<f64>, day_full_stop: Option<f64>, night_full_stop: f64) -> f64 {
    match (all, day_full_stop) {
        (Some(all), Some(day)) => (all - day - night_full_stop).max(0.0),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wheels_off_to_on_as_air_time() {
        assert_eq!(air_hours(Some("1405"), Some("1529"), 2.0), Some(1.4));
        assert_eq!(air_hours(Some("23:50"), Some("00:20"), 1.0), Some(0.5));
        // Never more than the flight time that holds it.
        assert_eq!(air_hours(Some("0800"), Some("1000"), 1.5), Some(1.5));
        assert_eq!(air_hours(Some(""), Some("1000"), 1.5), None);
        assert_eq!(air_hours(None, Some("1000"), 1.5), None);
        assert_eq!(air_hours(Some("2575"), Some("1000"), 1.5), None);
    }

    #[test]
    fn landings_not_to_a_full_stop() {
        assert_eq!(touch_and_goes(Some(4.0), Some(2.0), 1.0), 1.0);
        assert_eq!(touch_and_goes(Some(2.0), Some(2.0), 1.0), 0.0);
        assert_eq!(touch_and_goes(None, Some(3.0), 0.0), 0.0);
        assert_eq!(touch_and_goes(Some(3.0), None, 0.0), 0.0);
    }
}
