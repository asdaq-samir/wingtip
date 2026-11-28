//! A pilot's currency and a student's aeronautical experience, worked out
//! from the logbook: the gateway's CurrencyService and TrainingService's
//! 61.109 checklist, moved here whole (#482 phase 1) so the rule is
//! written once and the gateway, which keeps the records, asks the
//! planner, which asks this.
//!
//! The entries are the gateway's LogbookEntry as the apps send it,
//! camelCase; a day is "YYYY-MM-DD" on the pilot's own calendar, so no
//! time zone enters here. A logbook is only as good as what is in it:
//! none of this is anyone's sign-off, and the pages say so.
//!
//! Passenger currency, 61.57(a)(1) and (b)(1): passengers.rs.

use super::js;
use crate::json::{self, Value};
use crate::time::{civil_from_days, days_from_civil, days_in_month};

/// 61.57(a), (b): "within the preceding 90 days".
pub const PASSENGER_DAYS: i64 = 90;
/// 61.57(a), (b): "at least three takeoffs and three landings".
pub const PASSENGER_LANDINGS: f64 = 3.0;
/// 61.56(c): a flight review "since the beginning of the 24th calendar
/// month before the month in which that pilot acts as pilot in command":
/// one passed in June 2025 serves through June 2027.
pub const FLIGHT_REVIEW_MONTHS: i64 = 24;
/// 61.57(c)(1): "within the 6 calendar months preceding the month of the
/// flight"; and 61.57(d): failed to meet (c) "for more than six calendar
/// months", only a proficiency check restores it.
pub const INSTRUMENT_MONTHS: i64 = 6;
/// 61.57(c)(1)(i): "Six instrument approaches."
pub const APPROACHES: f64 = 6.0;
/// 14 CFR 61.1(b), "Cross-country time" (ii) and (vi): for the private,
/// commercial and instrument experience (61.109, 61.129, 61.65) and the
/// ATP's, a point of landing "more than 50 nautical miles" in a straight
/// line from the original point of departure; 61.109(a)(5)(ii)'s solo
/// segment is the same distance. The track's logbook entry (autolog) logs
/// cross-country time by it.
pub const CROSS_COUNTRY_NM: f64 = 50.0;

/// A day as (year, month, day); Err where `iso` is no such day.
pub(crate) fn day(name: &str, iso: &str) -> Result<(i64, u32, u32), String> {
    crate::time::parse_date(iso).ok_or_else(|| format!("{name}: {iso:?} is not a day (YYYY-MM-DD)"))
}

/// A calendar month as a count of months, so months add and compare.
fn month_index(y: i64, m: u32) -> i64 {
    y * 12 + i64::from(m) - 1
}

/// The first day of a month counted by `month_index`, as "YYYY-MM-DD".
fn start_of_month(index: i64) -> String {
    let (y, m) = (index.div_euclid(12), index.rem_euclid(12) + 1);
    format!("{y:04}-{m:02}-01")
}

/// The last day of a month counted by `month_index`, as "YYYY-MM-DD".
fn end_of_month(index: i64) -> String {
    let (y, m) = (index.div_euclid(12), (index.rem_euclid(12) + 1) as u32);
    format!("{y:04}-{m:02}-{:02}", days_in_month(y, m))
}

pub(crate) fn iso_of_days(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// The last day of the calendar month `months` after the one `on` is in:
/// something done "within the preceding N calendar months" is good to
/// the last day of the Nth month after the one it was done in, whatever
/// day of that month it was (61.56(c)'s flight review, 61.57(c)'s window).
pub fn end_of_month_after(on: (i64, u32, u32), months: i64) -> String {
    end_of_month(month_index(on.0, on.1) + months)
}

/// One logbook entry, the columns these rules read.
pub struct Entry {
    pub day: i64,
    pub month: i64,
    pub flown_on: String,
    pub total: f64,
    pub night: f64,
    pub cross_country: f64,
    pub day_landings: f64,
    pub night_landings: f64,
    pub dual: f64,
    pub solo: f64,
    pub instrument: f64,
    pub towered: f64,
    pub distance_nm: f64,
    pub longest_leg_nm: f64,
    pub approaches: f64,
    pub holding: bool,
    pub tracking: bool,
    /// 61.57(a)(1)'s category and class, "airplane/single-engine land",
    /// None where the entry does not say both.
    pub class: Option<String>,
    /// Whether it was a tailwheel airplane; None where the entry does not say.
    pub tailwheel: Option<bool>,
    /// Landings to a full stop, day and night, where logged.
    pub full_stops: Option<f64>,
}

impl Entry {
    pub(crate) fn landings(&self) -> f64 {
        self.day_landings + self.night_landings
    }
}

/// The entries as the gateway sends them, each needing its `flownOn`; a
/// column missing or null is none of it.
pub fn entries(name: &str, items: &[Value]) -> Result<Vec<Entry>, String> {
    items
        .iter()
        .map(|e| {
            let flown_on = e.get("flownOn").and_then(Value::as_str).ok_or_else(|| format!("{name}: an entry's \"flownOn\" is missing"))?;
            let (y, m, d) = day(name, flown_on)?;
            let num = |k: &str| match e.get(k) {
                None | Some(Value::Null) => Ok(0.0),
                Some(Value::Number(n)) => Ok(*n),
                Some(_) => Err(format!("{name}: an entry's \"{k}\" is not a number")),
            };
            let flag = |k: &str| matches!(e.get(k), Some(Value::Bool(true)));
            Ok(Entry {
                day: days_from_civil(y, m, d),
                month: month_index(y, m),
                flown_on: flown_on.to_owned(),
                total: num("totalHours")?,
                night: num("nightHours")?,
                cross_country: num("crossCountryHours")?,
                day_landings: num("dayLandings")?,
                night_landings: num("nightLandings")?,
                dual: num("dualHours")?,
                solo: num("soloHours")?,
                instrument: num("instrumentHours")?,
                towered: num("toweredLandings")?,
                distance_nm: num("distanceNm")?,
                longest_leg_nm: num("longestLegNm")?,
                approaches: num("approaches")?,
                holding: flag("holding"),
                tracking: flag("tracking"),
                class: match (e.get("category").and_then(Value::as_str), e.get("class").and_then(Value::as_str)) {
                    (Some(c), Some(k)) if !c.is_empty() && !k.is_empty() => Some(format!("{}/{}", c.to_lowercase(), k.to_lowercase())),
                    _ => None,
                },
                tailwheel: match e.get("tailwheel") {
                    Some(Value::Bool(b)) => Some(*b),
                    _ => None,
                },
                full_stops: match e.get("fullStopLandings") {
                    None | Some(Value::Null) => None,
                    _ => Some(num("fullStopLandings")?),
                },
            })
        })
        .collect()
}

/// Hours to the tenth, as the logbook keeps them.
fn tenth(hours: f64) -> f64 {
    js::round(hours * 10.0) / 10.0
}

/// The entries flown in the 6 calendar months preceding `month`
/// (61.57(c)(1)): the month of the flight itself not counted, as the rule
/// is written -- an approach flown this month counts from next month on,
/// the stricter reading, as the FAA has not said otherwise.
fn in_window(entries: &[Entry], month: i64) -> impl Iterator<Item = &Entry> {
    entries.iter().filter(move |e| e.month >= month - INSTRUMENT_MONTHS && e.month < month)
}

/// Whether the window before `month` holds 61.57(c)(1)'s three: six
/// approaches, holding, and intercepting and tracking courses.
fn instrument_current_in(entries: &[Entry], month: i64) -> bool {
    in_window(entries, month).map(|e| e.approaches).sum::<f64>() >= APPROACHES
        && in_window(entries, month).any(|e| e.holding)
        && in_window(entries, month).any(|e| e.tracking)
}

/// The months the pilot is instrument current, by `month_index`, oldest
/// first (61.57(c)(1), (d)). A month is current where a proficiency check
/// falls in it or the six before it (61.57(d): the check restores
/// currency, and the six months after it are its window), or where its
/// six preceding months hold all three of (c)(1) and the pilot may still
/// restore currency that way. 61.57(d): "a person who has failed to meet
/// the instrument experience requirements of paragraph (c) for more than
/// six calendar months may reestablish instrument currency only by
/// completing an instrument proficiency check" -- so once the last
/// current month is more than six behind, logged approaches no longer
/// count, until a check is taken.
///
/// The logbook does not say when the rating was earned, so a logbook that
/// never shows currency is taken as lapsed from the month before its first
/// flight: the experience must be flown within its first six months, or a
/// check is asked for. That errs toward asking for a check; a pilot whose
/// instrument practical test came since gives its date as the check's.
/// With the stricter reading of (c)(1) (a month's own flights count from
/// the next), tasks flown in the sixth month of the grace period count
/// only in the seventh, past it: also the safer side.
fn instrument_months(entries: &[Entry], ipc: Option<i64>) -> Vec<i64> {
    let first = entries.iter().map(|e| e.month).chain(ipc).min();
    let last = entries.iter().map(|e| e.month + INSTRUMENT_MONTHS).chain(ipc.map(|i| i + INSTRUMENT_MONTHS)).max();
    let (Some(first), Some(last)) = (first, last) else {
        return Vec::new();
    };
    let mut current = Vec::new();
    // The last month current, or the month before the logbook's first.
    let mut last_current = first - 1;
    for month in first..=last + 1 {
        let checked = ipc.is_some_and(|i| i <= month && month <= i + INSTRUMENT_MONTHS);
        let in_grace = month - last_current <= INSTRUMENT_MONTHS;
        if checked || (in_grace && instrument_current_in(entries, month)) {
            current.push(month);
            last_current = month;
        }
    }
    current
}

/// The last month of instrument currency (61.57(c)(1), (d)), by
/// `month_index`; None where the logbook and the check never give one. In
/// the past where it has lapsed.
fn instrument_until(entries: &[Entry], ipc: Option<i64>) -> Option<i64> {
    instrument_months(entries, ipc).last().copied()
}

/// The first month of instrument currency still to come, by `month_index`:
/// where the pilot is not current in `month` but will be by `until` (the
/// approaches, holding and tracking were flown this month, and under the
/// stricter reading of 61.57(c)(1) count only from next month), the first
/// month after it that is current; None where they are current now or
/// nothing is to come. The answer gives it so no app says "current until"
/// of a pilot the rule counts as not current yet.
fn instrument_from(entries: &[Entry], ipc: Option<i64>, until: Option<i64>, month: i64) -> Option<i64> {
    let until = until.filter(|&u| u > month)?;
    let current = instrument_months(entries, ipc);
    if current.contains(&month) {
        return None;
    }
    current.into_iter().find(|&m| m > month && m <= until)
}

mod dates;
mod passengers;
pub use dates::*;
pub use passengers::{flying, Judged};
