//! What is due and when: each of the pilot's currencies, read off the
//! engine's own pilot_currency answer (currency.rs) so no date is worked
//! out twice, with how many days are left on it and whether the pilot is
//! reminded. A student is held to the solo endorsement instead of the
//! flight review (14 CFR 61.56(g): "A student pilot need not accomplish
//! the flight review ... provided the student pilot is undergoing
//! training for a certificate and has a current solo flight endorsement
//! as required under § 61.87").

use crate::json::{self, Value};
use crate::pilot::currency::{currency_json, day, Dates, Entry};
use crate::pilot::records::{said, solo_until, Held};
use crate::time::days_from_civil;

/// Where a currency stands on the day asked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// Good past the reminder's days.
    Current,
    /// Good, but lapses within the reminder's days.
    DueSoon,
    /// Lapsed: the privilege it gives is not the pilot's today.
    Lapsed,
    /// Not current yet, but will be from a day to come: instrument tasks
    /// flown this month count from the first of next (61.57(c)(1)).
    Pending,
    /// Nothing on record to work it out from.
    Unknown,
}

impl Status {
    pub fn key(self) -> &'static str {
        match self {
            Status::Current => "current",
            Status::DueSoon => "due_soon",
            Status::Lapsed => "lapsed",
            Status::Pending => "pending",
            Status::Unknown => "unknown",
        }
    }
}

/// One currency: its key, its name, the rule, its last good day (or the
/// first, for a pending one) as a day count, where it stands and what it
/// takes, in a sentence.
pub struct Due {
    pub key: &'static str,
    pub label: &'static str,
    pub rule: &'static str,
    pub until: Option<i64>,
    pub from: Option<i64>,
    pub days_left: Option<i64>,
    pub status: Status,
    pub detail: String,
    /// Only an instrument proficiency check restores it (61.57(d)).
    pub check: bool,
}

/// What the pilot holds, as far as the plan needs it.
pub struct Standing {
    pub student: bool,
    pub instrument: bool,
}

fn date_of(name: &str, v: &Value, key: &str) -> Result<Option<i64>, String> {
    match v.get(key).and_then(Value::as_str) {
        Some(iso) => {
            let (y, m, d) = day(name, iso)?;
            Ok(Some(days_from_civil(y, m, d)))
        }
        None => Ok(None),
    }
}

fn status_of(until: Option<i64>, today: i64, remind_days: i64) -> (Status, Option<i64>) {
    match until {
        None => (Status::Unknown, None),
        Some(u) if u < today => (Status::Lapsed, Some(u - today)),
        Some(u) if u - today <= remind_days => (Status::DueSoon, Some(u - today)),
        Some(u) => (Status::Current, Some(u - today)),
    }
}

/// Each currency due, in the order a pilot reads them, and the engine's
/// pilot_currency answer they were read from.
pub fn due(
    name: &str, entries: &[Entry], dates: &Dates, standing: &Standing, held: &[Held], today: i64, remind_days: i64,
) -> Result<(Vec<Due>, Value), String> {
    let currency = json::parse(&currency_json(name, entries, dates)?)?;
    let at = |key: &str| date_of(name, &currency, key);
    let mut out = Vec::new();
    let mut push = |key, label, rule, until: Option<i64>, from: Option<i64>, detail: &dyn Fn(Status) -> String| {
        let (mut status, days_left) = status_of(until, today, remind_days);
        if from.is_some_and(|f| f > today) {
            status = Status::Pending;
        }
        out.push(Due { key, label, rule, until, from, days_left, status, detail: detail(status), check: false });
    };

    if standing.student {
        // 61.87(n): an endorsement "by an authorized instructor who gave the
        // training within the 90 days preceding the date of the flight";
        // (p)(4): it "remains current for solo flight privileges, provided an
        // authorized instructor updates the student's logbook every 90 days
        // thereafter". (p)'s other items are the instructor's own limits.
        push("solo", "Solo endorsement", "14 CFR 61.87(n), (p)(4)", solo_until(held), None, &|s| match s {
            Status::Unknown => "No solo endorsement on record".to_owned(),
            Status::Lapsed => "Lapsed: solo again only after an instructor's new endorsement (61.87(p)(4))".to_owned(),
            _ => "Good for 90 days from the instructor's endorsement (61.87(n), (p)(4))".to_owned(),
        });
    } else {
        push("flight_review", "Flight review", "14 CFR 61.56(c)", at("flightReviewUntil")?, None, &|s| {
            match s {
            Status::Unknown => "No flight review on record: one is needed to act as pilot in command (61.56(c))".to_owned(),
            Status::Lapsed => "Lapsed: no acting as pilot in command until a flight review, at least an hour of ground and an hour of flight training (61.56(a))".to_owned(),
            _ => "Good to the end of the 24th calendar month after the review (61.56(c))".to_owned(),
        }
        });
    }
    push("day_passengers", "Passengers by day", "14 CFR 61.57(a)", at("dayPassengersUntil")?, None, &|s| match s {
        Status::Current | Status::DueSoon => "90 days from the third most recent landing (61.57(a))".to_owned(),
        _ => "Three takeoffs and three landings, as sole manipulator of the controls, before carrying passengers (61.57(a))".to_owned(),
    });
    push("night_passengers", "Passengers at night", "14 CFR 61.57(b)", at("nightPassengersUntil")?, None, &|s| {
        match s {
        Status::Current | Status::DueSoon => "90 days from the third most recent night full-stop landing (61.57(b))".to_owned(),
        _ => "Three takeoffs and three landings to a full stop, from 1 hour after sunset to 1 hour before sunrise, before carrying passengers then (61.57(b))".to_owned(),
    }
    });
    if let Some(medical) = at("medicalExpiresOn")? {
        push("medical", "Medical certificate", "14 CFR 61.23", Some(medical), None, &|s| match s {
            Status::Lapsed => "Expired, as you gave it (61.23)".to_owned(),
            _ => "As you gave it: its length depends on its class and your age (61.23(d))".to_owned(),
        });
    }
    // Last, so the item's check is set once `push` is done with `out`.
    if standing.instrument {
        let approaches = currency.get("approachesInWindow").and_then(Value::as_f64).unwrap_or(0.0);
        let ipc_after = at("ipcNeededAfter")?;
        let past_grace = ipc_after.is_none_or(|a| today > a);
        let from = at("instrumentCurrentFrom")?;
        push("instrument", "Instrument currency", "14 CFR 61.57(c)", at("instrumentCurrentUntil")?, from, &|s| {
            match s {
            Status::Pending => format!("Current from {}: tasks flown this month count from the first of next (61.57(c)(1))", from.map(said).unwrap_or_default()),
            Status::Lapsed | Status::Unknown if past_grace => "Only an instrument proficiency check restores it now (61.57(d))".to_owned(),
            Status::Lapsed => format!(
                "Lapsed: six approaches, holding and course tracking (61.57(c)(1)) restore it until {}, an instrument proficiency check after (61.57(d))",
                ipc_after.map(said).unwrap_or_default()
            ),
            _ => format!("{} of the six approaches flown in the 6 calendar months before this one (61.57(c)(1)(i))", approaches as i64),
        }
        });
        if let Some(d) = out.last_mut() {
            d.check = past_grace && matches!(d.status, Status::Lapsed | Status::Unknown);
        }
    }
    Ok((out, currency))
}

/// The reminder a pilot sees for a currency that lapses within the
/// reminder's days: "Passengers at night: current until 12 Nov 2026, in 3
/// days (14 CFR 61.57(b))."
pub fn reminder(d: &Due) -> Option<String> {
    if d.status != Status::DueSoon {
        return None;
    }
    let (until, left) = (d.until?, d.days_left?);
    let when = match left {
        0 => "today".to_owned(),
        1 => "tomorrow".to_owned(),
        n => format!("in {n} days"),
    };
    Some(format!("{}: current until {}, {when} ({}).", d.label, said(until), d.rule))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_currency_is_due_soon_inside_the_reminders_days_and_lapsed_after_its_last() {
        assert_eq!(status_of(Some(110), 100, 30), (Status::DueSoon, Some(10)));
        assert_eq!(status_of(Some(130), 100, 30), (Status::DueSoon, Some(30)));
        assert_eq!(status_of(Some(131), 100, 30), (Status::Current, Some(31)));
        assert_eq!(status_of(Some(100), 100, 30), (Status::DueSoon, Some(0)));
        assert_eq!(status_of(Some(99), 100, 30), (Status::Lapsed, Some(-1)));
        assert_eq!(status_of(None, 100, 30), (Status::Unknown, None));
    }
}
