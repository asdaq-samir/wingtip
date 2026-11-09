//! A pilot's proficiency plan (`proficiency_plan`): what is due and when
//! (14 CFR 61.56's flight review, 61.57's passenger and instrument
//! currency, from the engine's own pilot_currency; a student's solo
//! endorsement, 61.87), the reminders for those lapsing soon, the weak
//! areas their own debriefed flights show with the lines that show them,
//! and a short plan of sessions -- what to practise, why, where (a field
//! near home the host found in its data), how long, and whether it may
//! count toward a WINGS phase.
//!
//! Every decision is made here: what is due, what is weak and what may
//! count. The assistant only puts the plan into words, citing the ids
//! this answer gives each currency ("due:night_passengers") and each line
//! of evidence ("ev:2"), and never decides what is due.

pub mod due;
pub mod evidence;
pub mod sessions;
mod write;

use crate::json::Value;
use crate::pilot::currency::{self, day, Dates};
use crate::pilot::records::held_of;
use crate::time::days_from_civil;
use evidence::Weak;

/// How many days before a currency lapses its reminder shows, where the
/// host does not say: the gateway's reminder email's first, 30 days
/// before (services/gateway ReminderService).
pub const REMIND_DAYS: i64 = 30;

fn list<'a>(name: &str, v: &'a Value, key: &str) -> Result<&'a [Value], String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(l) => l.as_array().ok_or_else(|| format!("{name}: \"{key}\" is not a list")),
    }
}

fn date<'a>(name: &str, v: &'a Value, key: &str) -> Result<Option<&'a str>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.as_str())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a day")),
    }
}

fn plan(name: &str, v: &Value) -> Result<String, String> {
    let today_iso = v.get("today").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"today\" is missing"))?;
    let (y, m, d) = day(name, today_iso)?;
    let today = days_from_civil(y, m, d);
    let entries = currency::entries(name, list(name, v, "entries")?)?;
    let dates = Dates {
        flight_review_on: date(name, v, "flight_review_on")?,
        medical_expires_on: date(name, v, "medical_expires_on")?,
        ipc_on: date(name, v, "ipc_on")?,
        today: today_iso,
    };
    let ratings = list(name, v, "ratings")?;
    let rated = |r: &str| ratings.iter().any(|x| x.as_str() == Some(r));
    let standing = due::Standing { student: rated("student"), instrument: rated("instrument") };
    let held = held_of(name, v)?;
    let remind_days = v.get("remind_days").and_then(Value::as_f64).map_or(REMIND_DAYS, |d| d.max(0.0) as i64);

    let (due, currency) = due::due(name, &entries, &dates, &standing, &held, today, remind_days)?;
    let evidence = evidence::evidence(name, list(name, v, "debriefs")?, today)?;
    // The weak areas, the most evidence first, ties in Weak::ALL's order.
    let mut weak: Vec<(Weak, Vec<&evidence::Evidence>)> =
        Weak::ALL.iter().map(|w| (*w, evidence.iter().filter(|e| e.weak == *w).collect::<Vec<_>>())).filter(|(_, e)| !e.is_empty()).collect();
    weak.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
    let places = sessions::places(name, list(name, v, "places")?)?;
    let sessions = sessions::plan(&due, &weak, &currency, &places);
    Ok(write::plan(today_iso, &due, &evidence, &weak, &sessions))
}

/// The rules this module answers, by name.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "proficiency_plan" => plan(name, v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
