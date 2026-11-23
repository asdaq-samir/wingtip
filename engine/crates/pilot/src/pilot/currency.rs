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
//! What it simplifies, each toward telling the pilot less than they may
//! have rather than more: 61.57(a) and (b) also ask the landings be in
//! the same category, class and type (a tailwheel's to a full stop), which
//! the logbook's columns do not say, so every landing logged counts; the
//! night landings counted are the logbook's night full-stop ones (61.57(b)
//! "to a full stop during the period beginning 1 hour after sunset and
//! ending 1 hour before sunrise"), as the pilot logged them.

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
}

impl Entry {
    fn landings(&self) -> f64 {
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
            })
        })
        .collect()
}

/// Hours to the tenth, as the logbook keeps them.
fn tenth(hours: f64) -> f64 {
    js::round(hours * 10.0) / 10.0
}

/// 61.57(a), (b): 90 days after the day the third most recent landing was
/// made on -- a flight on that day still has the landing within its
/// preceding 90 days; None with fewer than three logged.
fn passengers_until(entries: &[Entry], landings: &dyn Fn(&Entry) -> f64) -> Option<String> {
    let mut newest: Vec<&Entry> = entries.iter().collect();
    // Newest first; flights of one day kept in the order given.
    crate::sort::StableSort::stable_sort_by_key(&mut newest[..], |e| std::cmp::Reverse(e.day));
    let mut counted = 0.0;
    for e in newest {
        counted += landings(e);
        if counted >= PASSENGER_LANDINGS {
            return Some(iso_of_days(e.day + PASSENGER_DAYS));
        }
    }
    None
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

/// The last month of instrument currency (61.57(c)(1), (d)), by
/// `month_index`: the latest month whose six preceding months hold all
/// three, or the sixth month after a proficiency check's (61.57(d): the
/// check restores currency, and the six months after it are its window);
/// None with neither. In the past where it has lapsed.
fn instrument_until(entries: &[Entry], ipc: Option<i64>) -> Option<i64> {
    let mut best = ipc.map(|m| m + INSTRUMENT_MONTHS);
    let mut flown: Vec<i64> = entries.iter().map(|e| e.month).collect();
    flown.sort_unstable();
    flown.dedup();
    // Each month a logged flight could have made current: the one after
    // it, up to six after (no later month has it in its window).
    for month in flown {
        for ahead in (1..=INSTRUMENT_MONTHS).rev() {
            let candidate = month + ahead;
            if best.is_some_and(|b| candidate <= b) {
                break;
            }
            if instrument_current_in(entries, candidate) {
                best = Some(candidate);
                break;
            }
        }
    }
    best
}

/// Whether the pilot is instrument current in `month` (61.57(c)(1), (d)):
/// its six preceding months hold all three, or a proficiency check in
/// `ipc` falls in it or the six months before it.
fn instrument_current_on(entries: &[Entry], ipc: Option<i64>, month: i64) -> bool {
    instrument_current_in(entries, month) || ipc.is_some_and(|i| i <= month && month <= i + INSTRUMENT_MONTHS)
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
    if instrument_current_on(entries, ipc, month) {
        return None;
    }
    (month + 1..=until).find(|&m| instrument_current_on(entries, ipc, m))
}

mod dates;
pub use dates::*;
