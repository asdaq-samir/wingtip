//! How far back an instructor's page lists the endorsements they signed:
//! "Each flight instructor must retain the records required by this
//! section for at least 3 years" (14 CFR 61.189(c)), the record of each
//! solo endorsement and each test endorsement 61.189(b) asks for. The
//! gateway keeps the records and asks this through the planner (GET
//! /api/pilot/instructor-records-since) for the first day to list.
//!
//! Days are "YYYY-MM-DD" on the pilot's own calendar, as records.rs reads
//! them.

use super::currency::day;
use crate::json::{self, Value};
use crate::time::days_in_month;

/// The years an instructor keeps the record (61.189(c)).
pub const RECORD_YEARS: i64 = 3;

/// The same day `RECORD_YEARS` before `today`, a 29 February the 28th in
/// a year without one: a day earlier, so the page lists more rather than
/// less of what 61.189(c) has the instructor keep.
pub fn records_since(today: (i64, u32, u32)) -> String {
    let (y, m, d) = today;
    let year = y - RECORD_YEARS;
    format!("{year:04}-{m:02}-{:02}", d.min(days_in_month(year, m)))
}

/// `instructor_records_since` from `{"today"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let today = v.get("today").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"today\" is missing"))?;
    let mut out = String::new();
    json::string(&mut out, &records_since(day(name, today)?));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn three_years_back_to_the_day() {
        assert_eq!(records_since((2026, 11, 17)), "2023-11-17");
    }

    #[test]
    fn a_leap_day_goes_back_to_the_28th() {
        assert_eq!(records_since((2028, 2, 29)), "2025-02-28");
    }
}
