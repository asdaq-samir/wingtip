//! Ready to fly: whether the device holds what the flight needs before it
//! leaves Wi-Fi and the cell towers behind, and what to fix while there
//! is still a signal. The apps gather the facts (what is downloaded, how
//! old it is, the battery) and draw the answer; what counts as ready and
//! how old is too old is decided here, once, for the web and both phones.
//!
//! It warns and never limits (the owner, 2026-10-23): every item is a
//! caution at worst, never a stop, and the pilot may fly whatever it says.
//! The answer is a look-and-go (the owner, 2026-11-03): one line, then at
//! most three one-line actions, the most pressing first.
//!
//! What it holds the facts to, and where each limit comes from:
//!
//! - Charts and the cycle packs (airports, airspace, procedures): in force
//!   for their own cycle only, by the FAA's 28 and 56 Day Product Schedule
//!   (`cycles`): the 56-day charting cycle for the charts, AIRAC's 28 days
//!   for NASR and the CIFP the packs are built from. 14 CFR 91.103 asks the
//!   pilot in command to become familiar with "all available information";
//!   a chart past its edition is no longer that.
//! - The weather briefing: fresh for an hour, the app's choice. No rule
//!   names an age; an hour is the routine METAR's interval (AIM 7-1-28,
//!   "METAR-hourly"; `validity::ROUTINE_INTERVAL_S`), so a briefing older
//!   than that has missed a report.
//! - A field's METAR: in force for the hour after it was observed
//!   (`validity`, AIM 7-1-28); its TAF present where one is issued.
//! - NOTAMs: fetched for the route (91.103's "all available information";
//!   AIM 5-1-3 says NOTAMs are part of a preflight briefing) and fresh for
//!   an hour, the app's choice: a NOTAM may be issued at any time.
//! - What Keep for the Air holds for the route (`kept`): the briefing,
//!   METARs and TAFs, NOTAMs, airport cards, plates, the plan and its nav
//!   log, the Go / No-Go and the weather loop, on board or not; their ages
//!   are held to the limits above by `kept_age` (ready/kept.rs).
//! - The battery: half charged or more, or charging, the app's choice; no
//!   regulation sets one for a Part 91 pilot's own device.

use crate::cycles::{self, Kind, State};
use crate::json::{self, Value};
use crate::validity::ROUTINE_INTERVAL_S;

mod checks;
pub mod kept;
use checks::{device_items, list, notam_item, weather_items};

type R<T> = Result<T, String>;

/// How long a weather briefing counts as fresh, seconds: the app's
/// choice, at the routine METAR's hour (AIM 7-1-28).
pub const BRIEFING_FRESH_S: i64 = ROUTINE_INTERVAL_S;
/// How long the route's NOTAMs count as fresh, seconds: the app's choice.
pub const NOTAMS_FRESH_S: i64 = 3600;
/// Below this charge, and not charging, the battery is a caution: the
/// app's choice.
pub const BATTERY_LOW_PCT: f64 = 50.0;
/// How many actions the answer leads with (the look-and-go rule).
pub const ACTIONS: usize = 3;

/// One thing checked: its key, whether it is fine, a line a pilot acts on,
/// a line under it, where its limit comes from, and the fix the app does
/// in place for it (none where nothing on the device can fix it).
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub key: &'static str,
    pub ok: bool,
    pub line: String,
    pub detail: String,
    pub source: &'static str,
    pub fix: Option<&'static str>,
}

fn item(key: &'static str, ok: bool, line: String, detail: String, source: &'static str, fix: Option<&'static str>) -> Item {
    Item { key, ok, line, detail, source, fix: if ok { None } else { fix } }
}

const CYCLE_SOURCE: &str = "FAA 28 and 56 Day Product Schedule; 14 CFR 91.103";
const APP_CHOICE: &str = "The app's choice";

/// A day as the pilot reads it: "26 Nov".
fn day_words(day: i64) -> String {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let (_, m, d) = crate::time::civil_from_days(day);
    format!("{d} {}", MONTHS[(m as usize).saturating_sub(1) % 12])
}

/// A whole number with thousands set off: "5,500" (a NOTAM's heights
/// too, notam_read).
pub(crate) fn grouped(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

/// A count of minutes as a pilot reads an age: "40 min", "3 h".
fn age_words(seconds: i64) -> String {
    let min = seconds.max(0) / 60;
    if min < 120 {
        format!("{min} min")
    } else {
        format!("{} h", min / 60)
    }
}

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key).filter(|x| !matches!(x, Value::Null))
}
fn flag(v: Option<&Value>, key: &str) -> Option<bool> {
    match v?.get(key) {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    }
}
fn num(v: Option<&Value>, key: &str) -> Option<f64> {
    v?.get(key).and_then(Value::as_f64)
}
fn text<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a str> {
    v?.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}
/// A "YYYY-MM-DD" member as a day; an error where it is there and no day.
fn day(v: Option<&Value>, key: &str) -> R<Option<i64>> {
    match text(v, key) {
        None => Ok(None),
        Some(t) => cycles::day_of(t).map(Some).ok_or_else(|| format!("ready_to_fly: \"{key}\" is not YYYY-MM-DD: {t:?}")),
    }
}

/// The flight plan: a route, an airplane and an altitude. None is assumed:
/// the airplane missing is asked for, never taken as a Cessna 172.
fn plan_items(plan: Option<&Value>, out: &mut Vec<Item>) -> bool {
    let route = flag(plan, "route").unwrap_or(false);
    out.push(item("route", route, "Plan the route".into(), "A departure and a destination".into(), "14 CFR 91.103", Some("set_route")));
    let airplane = text(plan, "airplane");
    out.push(item(
        "airplane",
        airplane.is_some(),
        match airplane {
            Some(a) => format!("Airplane {a}"),
            None => "Pick the airplane".into(),
        },
        "Its fuel, performance and loading come from its own figures".into(),
        "14 CFR 91.103(b)",
        Some("pick_airplane"),
    ));
    let altitude = num(plan, "altitude_ft");
    out.push(item(
        "altitude",
        altitude.is_some(),
        match altitude {
            Some(ft) => format!("Cruise at {} ft", grouped(ft.round() as i64)),
            None => "Set the cruise altitude".into(),
        },
        "The winds, fuel and terrain clearance are worked at it".into(),
        "14 CFR 91.103",
        Some("set_altitude"),
    ));
    route
}

/// The offline chart tiles for the route's corridor: kept, and of the
/// edition in force today (the 56-day charting cycle).
fn chart_item(charts: Option<&Value>, today: i64) -> R<Option<Item>> {
    let Some(charts) = charts else { return Ok(None) };
    let size = num(Some(charts), "download_mb").map(|mb| format!(", {} MB", mb.round().max(1.0) as i64)).unwrap_or_default();
    if flag(Some(charts), "can_keep") == Some(false) {
        let line = "Charts can't be kept offline here".to_owned();
        return Ok(Some(item("charts", false, line, "They need a connection in the air".into(), CYCLE_SOURCE, None)));
    }
    if !flag(Some(charts), "kept").unwrap_or(false) {
        let line = format!("Download charts for the route{size}");
        return Ok(Some(item("charts", false, line, "Not on this device yet".into(), CYCLE_SOURCE, Some("download_charts"))));
    }
    let c = cycles::cycle(Kind::Chart, day(Some(charts), "edition")?, today);
    Ok(Some(match c.state {
        State::Expired => item(
            "charts",
            false,
            format!("Download the new charts for the route{size}"),
            format!("The kept charts went out of date on {}", day_words(c.expires.unwrap_or(c.current))),
            CYCLE_SOURCE,
            Some("download_charts"),
        ),
        _ => item(
            "charts",
            true,
            "Charts for the route on this device".into(),
            format!("Current to {}", day_words(c.expires.unwrap_or(c.next))),
            CYCLE_SOURCE,
            None,
        ),
    }))
}

/// The engine's cycle packs (airports, airspace, procedures): present, and
/// of the AIRAC cycle in force.
fn pack_item(packs: Option<&Value>, today: i64) -> R<Option<Item>> {
    let Some(packs) = packs else { return Ok(None) };
    let c = cycles::cycle(Kind::Airac, day(Some(packs), "edition")?, today);
    let next = format!("Next cycle {}", day_words(c.next));
    let fix = if flag(Some(packs), "can_update") == Some(false) { None } else { Some("update_packs") };
    Ok(Some(match c.state {
        State::Unknown => item("packs", false, "Download the airports, airspace and procedures".into(), next, CYCLE_SOURCE, fix),
        State::Expired => item(
            "packs",
            false,
            "Update the airports, airspace and procedures".into(),
            format!("Out of date since {}; {next}", day_words(c.expires.unwrap_or(c.current))),
            CYCLE_SOURCE,
            fix,
        ),
        _ => item(
            "packs",
            true,
            format!("FAA data cycle {} on this device", c.current_ident.as_deref().unwrap_or("")),
            next,
            CYCLE_SOURCE,
            None,
        ),
    }))
}

/// Every item, in the order the actions are taken from: the plan first
/// (the rest are for its route), then what needs the signal most.
pub fn items(v: &Value) -> R<(Vec<Item>, Option<i64>, i64)> {
    let now = v.get("now").and_then(Value::as_f64).ok_or("ready_to_fly: \"now\" (Unix seconds) is missing")? as i64;
    let today = now.div_euclid(86_400);
    let mut out = Vec::new();
    let routed = plan_items(get(v, "plan"), &mut out);
    let mut age = None;
    if routed {
        out.extend(chart_item(get(v, "charts"), today)?);
        out.extend(pack_item(get(v, "packs"), today)?);
        age = weather_items(v, now, &mut out);
        out.push(notam_item(get(v, "notams"), now));
        out.extend(kept::kept_item(get(v, "kept")));
    } else {
        out.extend(pack_item(get(v, "packs"), today)?);
    }
    device_items(v, &mut out);
    Ok((out, age, today))
}

/// `ready_to_fly` by name.
pub fn call(_name: &str, v: &Value) -> R<String> {
    let (items, age, today) = items(v)?;
    let todo: Vec<&Item> = items.iter().filter(|i| !i.ok).collect();
    let line = match todo.len() {
        0 => "Ready to fly: all on this device".to_owned(),
        1 => "1 thing to fix while you have a signal".to_owned(),
        n => format!("{n} things to fix while you have a signal"),
    };
    let next = cycles::start_on(Kind::Airac, today) + Kind::Airac.days();
    let mut out = format!("{{\"ready\":{},\"finding\":", todo.is_empty());
    json::string(&mut out, if todo.is_empty() { "ok" } else { "caution" });
    out.push_str(",\"line\":");
    json::string(&mut out, &line);
    out.push_str(",\"actions\":");
    write_items(&mut out, todo.iter().take(ACTIONS).copied());
    out.push_str(",\"items\":");
    write_items(&mut out, items.iter());
    out.push_str(",\"next_cycle\":");
    json::string(&mut out, &cycles::day_text(next));
    out.push_str(",\"next_cycle_ident\":");
    json::string(&mut out, &cycles::airac_ident(next));
    out.push_str(",\"briefing_age_min\":");
    match age {
        Some(a) => out.push_str(&(a / 60).to_string()),
        None => out.push_str("null"),
    }
    out.push('}');
    Ok(out)
}

fn write_items<'a>(out: &mut String, items: impl Iterator<Item = &'a Item>) {
    out.push('[');
    for (k, i) in items.enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"key\":");
        json::string(out, i.key);
        out.push_str(",\"finding\":");
        json::string(out, if i.ok { "ok" } else { "caution" });
        out.push_str(",\"line\":");
        json::string(out, &i.line);
        out.push_str(",\"detail\":");
        json::string(out, &i.detail);
        out.push_str(",\"source\":");
        json::string(out, i.source);
        out.push_str(",\"fix\":");
        json::opt_string(out, i.fix);
        out.push('}');
    }
    out.push(']');
}
