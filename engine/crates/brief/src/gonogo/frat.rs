//! A flight risk assessment before each flight (apps/web/src/lib/frat.ts and
//! lib/airworthiness.ts; the roadmap's FRAT, after the FAA Risk Management
//! Handbook's PAVE and IMSAFE, FAA-H-8083-2): points for what raises the
//! risk of this flight -- from the briefing (VFR not recommended, the
//! pilot's own minimums, a TFR on the route, SIGMETs and G-AIRMETs,
//! night), from the nav log's fuel check, from the pilot's own airplane's
//! inspections, from the pilot's logbook (the flight review, the medical,
//! recent landings) -- and for what only the pilot knows: IMSAFE, and the
//! pressures on the day.
//!
//! The points and where they turn the assessment amber and red are the
//! planner's own guide, not the FAA's and not a rule: the decision is the
//! pilot in command's (91.3, 91.103). What makes a flight unlawful --
//! alcohol within 8 hours, a lapsed flight review or medical, tanks that
//! do not hold the fuel, an annual past due -- is high whatever else is.
//!
//! Dates are the pilot's days, "yyyy-mm-dd", compared as strings as the
//! web compares them.

use crate::json;

/// One factor: why it counts (the rule or the reason), its points, and
/// whether it makes the flight unlawful as planned (`stop`: high,
/// whatever the points). A self check's keeps its group.
#[derive(Clone, Debug, PartialEq)]
pub struct Factor {
    pub key: String,
    pub label: String,
    pub why: Option<String>,
    pub points: i64,
    pub stop: bool,
    pub group: Option<String>,
}

fn factor(key: &str, label: impl Into<String>, why: impl Into<String>, points: i64, stop: bool) -> Factor {
    Factor { key: key.into(), label: label.into(), why: Some(why.into()), points, stop, group: None }
}

/// A check only the pilot can answer: key, group, label, why, points,
/// stop.
pub struct SelfCheck {
    pub key: &'static str,
    pub group: &'static str,
    pub label: &'static str,
    pub why: &'static str,
    pub points: i64,
    pub stop: bool,
}

const fn check(key: &'static str, group: &'static str, label: &'static str, why: &'static str, points: i64) -> SelfCheck {
    SelfCheck { key, group, label, why, points, stop: false }
}

/// What only the pilot can say, ticked where it is so: the IMSAFE
/// checklist and PAVE's pressures and unfamiliarity.
pub const SELF_CHECKS: [SelfCheck; 9] = [
    check("illness", "You", "Ill, or not over it yet", "IMSAFE: illness", 5),
    check("medication", "You", "On a medication that could impair you", "61.53, IMSAFE: medication", 5),
    check("stress", "You", "Under stress: work, home or money", "IMSAFE: stress", 3),
    SelfCheck {
        key: "alcohol",
        group: "You",
        label: "Alcohol in the last 8 hours, or still feeling it",
        why: "91.17",
        points: 0,
        stop: true,
    },
    check("fatigue", "You", "Under 8 hours' sleep, or a long day already", "IMSAFE: fatigue", 4),
    check("eating", "You", "Hungry or thirsty", "IMSAFE: eating", 1),
    check("pressure", "The day", "Somewhere to be by a time, or people counting on it", "PAVE: external pressures", 3),
    check("unfamiliar", "The day", "A field or a route new to you", "PAVE: environment", 2),
    check("rusty", "The day", "Not flown this airplane in 30 days", "PAVE: aircraft", 3),
];

/// At these points the assessment is amber, and at these red.
pub const CAUTION_FROM: i64 = 6;
pub const HIGH_FROM: i64 = 12;

/// Each level's name and what to do at it.
pub const LEVELS: [(&str, &str, &str); 3] = [
    ("low", "Low", "Go, with the usual care."),
    ("caution", "Raised", "Bring it down where you can (a later time, a shorter leg, an instructor along), or talk it over."),
    ("high", "High", "Do not go as planned."),
];

pub fn level_name(level: &str) -> &str {
    LEVELS.iter().find(|l| l.0 == level).map_or(level, |l| l.1)
}

pub fn level_words(level: &str) -> Option<&'static str> {
    LEVELS.iter().find(|l| l.0 == level).map(|l| l.2)
}

/// The pilot's own airplane's inspections and tests as its owner recorded
/// them, each its last good day, "yyyy-mm-dd" (None not recorded).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Inspections {
    pub annual_good_through: Option<String>,
    pub elt_inspection_good_through: Option<String>,
    pub elt_battery_due_on: Option<String>,
    pub static_check_good_through: Option<String>,
    pub transponder_check_good_through: Option<String>,
    pub hundred_hour_due_at_hours: Option<f64>,
    /// Flown for hire or for instruction for hire (91.409(b)), the owner's
    /// word: Some(false) leaves the 100-hour unweighed; None weighs a due
    /// given, the caller having judged it.
    pub for_hire: Option<bool>,
    pub hours_now: Option<f64>,
}

fn given(s: &Option<String>) -> Option<&str> {
    s.as_deref().filter(|s| !s.is_empty())
}

/// Whether the pilot's own airplane may be flown on the day, by the
/// inspections and tests its owner has recorded: each recorded one past
/// its last good day is a factor. What has not been recorded says
/// nothing, either way.
///
/// - The annual (14 CFR 91.409(a)) and the ELT's inspection (91.207(d))
///   or its battery past the date marked on it (91.207(c)): no flight as
///   planned. The ELT's are not owed on a training flight within 50 nm of
///   its departure, among 91.207(f)'s exceptions, which the pilot weighs.
/// - The altimeter and static test (91.411(a)): no IFR in controlled
///   airspace, so a stop under IFR and nothing under VFR.
/// - The transponder test (91.413(a)): the transponder may not be used,
///   which keeps the flight out of the airspace 91.215(b) requires one in
///   -- a caution, as a flight can stay out of it.
/// - The 100-hour (91.409(b)): owed only for hire, or for instruction in
///   an airplane the instructor provides -- a caution.
pub fn inspection_factors(i: &Inspections, day: &str, ifr: bool) -> Vec<Factor> {
    let past = |good_through: &Option<String>| given(good_through).is_some_and(|g| g < day);
    let mut factors = Vec::new();
    if past(&i.annual_good_through) {
        factors.push(factor("annual", "The airplane's annual inspection is past due", "91.409(a)", 0, true));
    }
    if past(&i.elt_inspection_good_through) {
        factors.push(factor("elt", "The ELT's inspection is past due", "91.207(d), but for 91.207(f)'s exceptions", 0, true));
    }
    // The battery is to be replaced by the date marked: on it, it is due.
    if given(&i.elt_battery_due_on).is_some_and(|d| d <= day) {
        factors.push(factor(
            "eltBattery", "The ELT's battery is past its replacement date", "91.207(c), but for 91.207(f)'s exceptions", 0, true,
        ));
    }
    if ifr && past(&i.static_check_good_through) {
        factors.push(factor("static", "The altimeter and static test is past due: no IFR in controlled airspace", "91.411(a)", 0, true));
    }
    if past(&i.transponder_check_good_through) {
        factors.push(factor(
            "transponder", "The transponder test is past due: stay out of the airspace that needs one", "91.413(a), 91.215(b)", 3, false,
        ));
    }
    if let (Some(due), Some(now)) = (i.hundred_hour_due_at_hours.filter(|_| i.for_hire != Some(false)), i.hours_now)
        && now >= due
    {
        factors.push(factor(
            "hundredHour",
            "The 100-hour inspection is due",
            "91.409(b): carrying anyone for hire, or flight instruction for hire in an airplane you provide",
            2,
            false,
        ));
    }
    factors
}

/// How far a 91.213(d) determination reaches: VFR by day, by day and
/// night, or every kind of flight (91.205(b)-(d)).
pub fn reach(deferred_for: &str) -> Option<i64> {
    match deferred_for {
        "VFR_DAY" => Some(0),
        "VFR" => Some(1),
        "ALL" => Some(2),
        _ => None,
    }
}

/// A squawk not yet fixed: what it says, whether the item is inoperative,
/// and how far its 91.213(d) determination reaches, where one was made.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Squawk {
    pub text: String,
    pub inoperative: bool,
    pub deferred_for: Option<String>,
}

/// The airplane's open squawks on the day: an instrument or equipment
/// that does not work stops the flight unless its 91.213(d) determination
/// was made for this kind of flight (by day, at night, under IFR: what
/// 91.205 does not ask by day it may at night or under IFR); the others
/// are a caution to read before flight (91.7(b)).
pub fn squawk_factors(open: &[Squawk], night: bool, ifr: bool) -> Vec<Factor> {
    let needs = if ifr {
        2
    } else if night {
        1
    } else {
        0
    };
    // A reach the web's REACH does not have compares as undefined: never
    // less, so that squawk is not one that grounds.
    let grounding: Vec<&Squawk> =
        open.iter().filter(|s| s.inoperative && s.deferred_for.as_deref().is_none_or(|d| reach(d).is_some_and(|r| r < needs))).collect();
    let mut factors = Vec::new();
    if !grounding.is_empty() {
        let texts: Vec<&str> = grounding.iter().map(|s| s.text.as_str()).collect();
        factors.push(factor(
            "inoperative",
            format!("Inoperative and not deferred for this flight: {}", texts.join("; ")),
            "91.213(d)",
            0,
            true,
        ));
    }
    let others = open.len() - grounding.len();
    if others > 0 {
        let (s, it) = if others == 1 { ("", "it") } else { ("s", "them") };
        factors.push(factor("squawks", format!("{others} open squawk{s}: read {it} before flight"), "91.7(b)", 1, false));
    }
    factors
}

mod input;
pub use input::*;
