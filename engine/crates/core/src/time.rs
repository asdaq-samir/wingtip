//! UTC dates as Unix seconds, for the weather products' day-and-hour
//! times, with no crate: Howard Hinnant's days-from-civil algorithm
//! (proleptic Gregorian, the calendar UTC is kept in). jiff, measured on
//! 2026-11-12 without its time zone database, would add 128 KB raw and
//! 40 KB gzipped to the web's module, a tenth of it, for UTC alone.

pub const DAY_S: i64 = 86_400;

/// Days since 1970-01-01 of a date.
pub fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = month as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The date of a day since 1970-01-01: (year, month, day).
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn days_in_month(year: i64, month: u32) -> u32 {
    let next = if month == 12 { days_from_civil(year + 1, 1, 1) } else { days_from_civil(year, month + 1, 1) };
    (next - days_from_civil(year, month, 1)) as u32
}

/// A day of the month at an hour and minute (hour 24 the next midnight),
/// in the month -- this one, the one before or the one after `near` --
/// that puts it nearest `near`, as the products give the day alone.
/// None where no such month has the day.
pub fn nearest_day(near: i64, day: u32, hour: u32, minute: u32) -> Option<i64> {
    let (y, m, _) = civil_from_days(near.div_euclid(DAY_S));
    let mut best: Option<i64> = None;
    for step in [0i64, -1, 1] {
        let months = y * 12 + m as i64 - 1 + step;
        let (yy, mm) = (months.div_euclid(12), (months.rem_euclid(12) + 1) as u32);
        if day == 0 || day > days_in_month(yy, mm) || hour > 24 || minute > 59 {
            continue;
        }
        let t = days_from_civil(yy, mm, day) * DAY_S + hour as i64 * 3600 + minute as i64 * 60;
        if best.is_none_or(|b| (t - near).abs() < (b - near).abs()) {
            best = Some(t);
        }
    }
    best
}

/// A day of the calendar written "YYYY-MM-DD", exactly ten characters
/// (ISO 8601's calendar date, as the gateway, a logbook and the FAA's
/// XNOTAMs write one), as (year, month, day); None for anything else, a
/// day its month lacks ("2026-02-30") included. The engine's one strict
/// reader of a date.
pub fn parse_date(text: &str) -> Option<(i64, u32, u32)> {
    let b = text.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' || ![0, 1, 2, 3, 5, 6, 8, 9].iter().all(|&i| b[i].is_ascii_digit()) {
        return None;
    }
    let (y, m, d) = (text[..4].parse().ok()?, text[5..7].parse().ok()?, text[8..].parse().ok()?);
    real_day(y, m, d)
}

/// parse_date as an app's own field may send one: spaces round it, and a
/// month or day of one digit ("2026-3-7"). None for a day its month lacks.
pub fn parse_date_loose(text: &str) -> Option<(i64, u32, u32)> {
    let mut parts = text.trim().split('-');
    let (y, m, d) = (parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next()?.parse().ok()?);
    if parts.next().is_some() {
        return None;
    }
    real_day(y, m, d)
}

/// (year, month, day) where the calendar has that day; the month is
/// checked before its length is asked.
fn real_day(y: i64, m: u32, d: u32) -> Option<(i64, u32, u32)> {
    ((1..=12).contains(&m) && d >= 1 && d <= days_in_month(y, m)).then_some((y, m, d))
}

/// Unix seconds as ISO 8601 UTC, "2026-11-02T14:00:00Z".
pub fn iso(t: i64) -> String {
    let (y, m, d) = civil_from_days(t.div_euclid(DAY_S));
    let s = t.rem_euclid(DAY_S);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", s / 3600, s % 3600 / 60, s % 60)
}

/// ISO 8601 UTC as the weather feeds write it, "2026-11-02T14:00:00Z",
/// with or without fractional seconds and with "Z" or "+00:00" (Python's
/// datetime.fromisoformat for these), as Unix seconds. None for anything
/// else, an offset other than UTC included: a time read wrongly by hours
/// would put a report in the wrong window.
pub fn parse_iso(text: &str) -> Option<i64> {
    let t = text.trim();
    let body = t.strip_suffix('Z').or_else(|| t.strip_suffix("+00:00")).unwrap_or(t);
    let (date, clock) = body.split_once('T').or_else(|| body.split_once(' '))?;
    let (y, m, day) = parse_date_loose(date)?;
    let whole = clock.split('.').next()?;
    let mut c = whole.split(':');
    let (h, mi) = (c.next()?.parse::<i64>().ok()?, c.next()?.parse::<i64>().ok()?);
    let s = match c.next() {
        Some(s) => s.parse::<i64>().ok()?,
        None => 0,
    };
    if c.next().is_some() || !(0..24).contains(&h) || !(0..60).contains(&mi) || !(0..61).contains(&s) {
        return None;
    }
    Some(days_from_civil(y, m, day) * DAY_S + h * 3600 + mi * 60 + s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_feeds_iso_times() {
        let t = days_from_civil(2026, 9, 20) * DAY_S + 3600 + 41 * 60;
        assert_eq!(parse_iso("2026-09-20T01:41:00.000Z"), Some(t));
        assert_eq!(parse_iso("2026-09-20T01:41:00Z"), Some(t));
        assert_eq!(parse_iso("2026-09-20T01:41:00+00:00"), Some(t));
        assert_eq!(parse_iso("2026-09-20T01:41:00-05:00"), None);
        assert_eq!(parse_iso("2026-02-30T01:41:00Z"), None);
        assert_eq!(parse_iso(""), None);
    }

    #[test]
    fn reads_a_date_strictly_and_loosely() {
        assert_eq!(parse_date("2028-02-29"), Some((2028, 2, 29)));
        assert_eq!(parse_date("2026-02-29"), None);
        assert_eq!(parse_date("2026-13-01"), None);
        assert_eq!(parse_date("2026-3-07"), None);
        assert_eq!(parse_date(" 2026-03-07"), None);
        assert_eq!(parse_date("2026-03-07T00:00"), None);
        assert_eq!(parse_date("2026/03/07"), None);
        assert_eq!(parse_date("2026-03-é7"), None);
        assert_eq!(parse_date_loose(" 2026-3-7 "), Some((2026, 3, 7)));
        assert_eq!(parse_date_loose("2026-04-31"), None);
        assert_eq!(parse_date_loose("2026-04-01-02"), None);
        assert_eq!(parse_date_loose("2026-04"), None);
    }

    #[test]
    fn round_trips_the_calendar() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(iso(1_793_628_000), "2026-11-02T14:00:00Z");
        for z in -800_000..800_000i64 {
            let (y, m, d) = civil_from_days(z);
            assert_eq!(days_from_civil(y, m, d), z);
        }
        // The 31st near the 1st of a 30-day month is the month before's.
        let nov1 = days_from_civil(2026, 11, 1) * DAY_S;
        assert_eq!(nearest_day(nov1, 31, 12, 0), Some(days_from_civil(2026, 10, 31) * DAY_S + 12 * 3600));
    }
}
