//! Passenger currency, 14 CFR 61.57(a)(1) and (b)(1), checked against the
//! eCFR (2026-11-27). (a)(1): no person may act as a pilot in command "of
//! an aircraft carrying persons ... unless that person has made at least
//! three takeoffs and three landings within the preceding 90 days", (i)
//! "acted as the sole manipulator of the flight controls" and (ii) "in an
//! aircraft of the same category, class, and type (if a class or type
//! rating is required), and, if the aircraft to be flown is an airplane
//! with a tailwheel, the takeoffs and landings must have been made to a
//! full stop in an airplane with a tailwheel". (b)(1) asks "three takeoffs
//! and three landings to a full stop during the period beginning 1 hour
//! after sunset and ending 1 hour before sunrise", (ii) "in an aircraft of
//! the same category, class, and type (if a class or type rating is
//! required)": the tailwheel clause is (a)(1)(ii)'s alone, so night is
//! judged by category and class only.
//!
//! Judged for the airplane to be flown (`flying`) where the ask says it;
//! else for the newest flight's category, class and tailwheel, with the
//! tailwheel's own currency beside it (`tailwheelPassengersUntil`) for a
//! pilot whose newest flight was a tricycle.
//!
//! The dates are what the logbook proves, never a guess: a landing counts
//! only where its entry says the same category and class, and toward a
//! tailwheel only where it says tailwheel and its full stops (else its
//! night landings, which the logbook keeps as full stops). An airplane to
//! be flown not said to be a tricycle is judged as a tailwheel, the
//! stricter. Where what isn't said would make the pilot current,
//! `passengerUnknown` says what isn't known, and the coach's rows say
//! "Can't tell" rather than "Current". A type rating's own type is not
//! told apart.

use super::*;

/// The airplane passenger currency is judged for: its category and class,
/// "airplane/single-engine land", and whether it is a tailwheel (None:
/// not said).
#[derive(Clone, Debug, PartialEq)]
pub struct Judged {
    pub class: String,
    pub tailwheel: Option<bool>,
}

/// The ask's `flying`, `{"category", "class", "tailwheel"}`: None where
/// it is missing or does not say both the category and the class.
pub fn flying(name: &str, v: Option<&Value>) -> Result<Option<Judged>, String> {
    let Some(f) = v.filter(|f| !matches!(f, Value::Null)) else {
        return Ok(None);
    };
    if !matches!(f, Value::Object(_)) {
        return Err(format!("{name}: \"flying\" is not an object"));
    }
    let word = |k: &str| f.get(k).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_lowercase);
    Ok(match (word("category"), word("class")) {
        (Some(c), Some(k)) => Some(Judged {
            class: format!("{c}/{k}"),
            tailwheel: match f.get("tailwheel") {
                Some(Value::Bool(b)) => Some(*b),
                _ => None,
            },
        }),
        _ => None,
    })
}

/// The airplane judged: `flying`, else the newest flight's; None where
/// neither says its category and class. The newest flight's gear is kept
/// as it is logged: not said stays not said, judged as a tailwheel and
/// "Can't tell", never taken for a tricycle.
pub(crate) fn judged(entries: &[Entry], flying: Option<&Judged>) -> Option<Judged> {
    if let Some(f) = flying {
        return Some(f.clone());
    }
    let newest = entries.iter().max_by_key(|e| e.day)?;
    newest.class.clone().map(|class| Judged { class, tailwheel: newest.tailwheel })
}

/// Whether the airplane judged takes 61.57(a)(1)(ii)'s tailwheel rule:
/// one said to be a tailwheel, or not said to be a tricycle.
fn as_tailwheel(j: &Judged) -> bool {
    j.tailwheel != Some(false)
}

/// The landings an entry surely gives toward `j` (61.57(a)(1)(ii)): none
/// in an entry that doesn't say its category and class, or says another;
/// toward a tailwheel, only one said to be a tailwheel, to a full stop.
pub(crate) fn surely(e: &Entry, j: Option<&Judged>, landings: &dyn Fn(&Entry) -> f64) -> f64 {
    let Some(j) = j else { return 0.0 };
    if e.class.as_ref() != Some(&j.class) {
        return 0.0;
    }
    if !as_tailwheel(j) {
        return landings(e);
    }
    if e.tailwheel != Some(true) {
        return 0.0;
    }
    landings(e).min(e.full_stops.unwrap_or(e.night_landings))
}

/// The landings an entry might give toward `j`, what isn't said taken
/// as counting: so the pilot is told "Can't tell" rather than "Lapsed"
/// where only what the logbook doesn't say stands between them.
fn maybe(e: &Entry, j: Option<&Judged>, landings: &dyn Fn(&Entry) -> f64) -> f64 {
    let Some(j) = j else { return landings(e) };
    match &e.class {
        Some(c) if *c != j.class => 0.0,
        _ if j.tailwheel != Some(true) => landings(e),
        _ if e.tailwheel == Some(false) => 0.0,
        _ => landings(e).min(e.full_stops.unwrap_or(landings(e))),
    }
}

/// 61.57(a), (b): 90 days after the day the third most recent landing was
/// made on -- a flight on that day still has the landing within its
/// preceding 90 days; None with fewer than three logged.
pub(crate) fn passengers_until(entries: &[Entry], landings: &dyn Fn(&Entry) -> f64) -> Option<String> {
    passengers_until_day(entries, landings).map(iso_of_days)
}

fn passengers_until_day(entries: &[Entry], landings: &dyn Fn(&Entry) -> f64) -> Option<i64> {
    let mut newest: Vec<&Entry> = entries.iter().collect();
    // Newest first; flights of one day kept in the order given.
    crate::sort::StableSort::stable_sort_by_key(&mut newest[..], |e| std::cmp::Reverse(e.day));
    let mut counted = 0.0;
    for e in newest {
        counted += landings(e);
        if counted >= PASSENGER_LANDINGS {
            return Some(e.day + PASSENGER_DAYS);
        }
    }
    None
}

/// Passengers by day and at night, as the logbook proves them, and what
/// isn't known where that is all that stands in the way.
pub struct Passengers {
    pub judged: Option<Judged>,
    pub day_until: Option<String>,
    pub night_until: Option<String>,
    /// The tailwheel's own, for a pilot judged in a tricycle whose
    /// logbook shows a tailwheel in the same class (61.57(a)(1)(ii)).
    pub tailwheel_until: Option<String>,
    /// What isn't known, where the pilot would be current by day if it
    /// were as they'd hope; None where nothing unsaid matters.
    pub day_unknown: Option<String>,
    pub night_unknown: Option<String>,
}

/// Passenger currency on `today` (a day count) for `flying`, else the
/// newest flight's airplane.
pub fn passengers(entries: &[Entry], flying: Option<&Judged>, today: i64) -> Passengers {
    let j = judged(entries, flying);
    let day = |e: &Entry| e.landings();
    let night = |e: &Entry| e.night_landings;
    // 61.57(b)(1)(ii) asks only the same category, class and type, so the
    // night's three need no tailwheel; (a)(1)(ii)'s tailwheel rule is the
    // day's (the logbook keeps night landings as full stops).
    let jn = j.as_ref().map(|j| Judged { class: j.class.clone(), tailwheel: Some(false) });
    let unknown = |j: Option<&Judged>, landings: &dyn Fn(&Entry) -> f64, rule: &str| {
        let sure = passengers_until_day(entries, &|e| surely(e, j, landings));
        let hoped = passengers_until_day(entries, &|e| maybe(e, j, landings));
        let current = |u: Option<i64>| u.is_some_and(|u| u >= today);
        (!current(sure) && current(hoped)).then(|| unsaid(entries, j, today, landings, rule))
    };
    let tailwheel = j.as_ref().filter(|j| !as_tailwheel(j)).and_then(|j| {
        let tw = Judged { class: j.class.clone(), tailwheel: Some(true) };
        let flown = entries.iter().any(|e| e.class.as_ref() == Some(&j.class) && e.tailwheel == Some(true));
        if flown {
            passengers_until(entries, &|e| surely(e, Some(&tw), &day))
        } else {
            None
        }
    });
    Passengers {
        day_until: passengers_until(entries, &|e| surely(e, j.as_ref(), &day)),
        night_until: passengers_until(entries, &|e| surely(e, jn.as_ref(), &night)),
        tailwheel_until: tailwheel,
        day_unknown: unknown(j.as_ref(), &day, "61.57(a)(1)"),
        night_unknown: unknown(jn.as_ref(), &night, "61.57(b)(1)"),
        judged: j,
    }
}

/// What the logbook doesn't say of the last 90 days' flights that might
/// have counted, in a sentence.
fn unsaid(entries: &[Entry], j: Option<&Judged>, today: i64, landings: &dyn Fn(&Entry) -> f64, rule: &str) -> String {
    let Some(j) = j else {
        return format!("Can't tell: your newest flight doesn't say the category and class, so no landing can be counted for the airplane you'll fly ({rule})");
    };
    let recent: Vec<&Entry> =
        entries.iter().filter(|e| e.day + PASSENGER_DAYS >= today && maybe(e, Some(j), landings) > surely(e, Some(j), landings)).collect();
    let count = |n: usize, what: &str| match n {
        1 => format!("1 flight in the last 90 days doesn't say the {what}"),
        n => format!("{n} flights in the last 90 days don't say the {what}"),
    };
    let no_class = recent.iter().filter(|e| e.class.is_none()).count();
    let no_tailwheel = recent.iter().filter(|e| e.class.is_some() && e.tailwheel.is_none()).count();
    let no_stops = recent.iter().filter(|e| e.class.is_some() && e.tailwheel == Some(true)).count();
    let mut said = Vec::new();
    if j.tailwheel.is_none() {
        said.push("it isn't said whether the airplane you'll fly has a tailwheel, so it is judged as one".to_owned());
    }
    if no_class > 0 {
        said.push(count(no_class, "category and class"));
    }
    if no_tailwheel > 0 {
        said.push(count(no_tailwheel, "airplane's gear, tailwheel or tricycle"));
    }
    if no_stops > 0 {
        said.push(count(no_stops, "tailwheel's full-stop landings"));
    }
    format!("Can't tell: {} ({rule})", said.join("; "))
}

#[cfg(test)]
#[path = "passengers_tests.rs"]
mod tests;
