//! Ready to fly's checks of what changes by the hour: the weather and
//! its fields, the NOTAMs, and the device (ready/mod.rs has the rule and its
//! sources).

use super::{age_words, flag, get, item, num, text, Item, APP_CHOICE, BATTERY_LOW_PCT, BRIEFING_FRESH_S, NOTAMS_FRESH_S};
use crate::json::Value;
use crate::validity::ROUTINE_INTERVAL_S;

/// The weather: the briefing's age, and each field's METAR and TAF.
pub(super) fn weather_items(v: &Value, now: i64, out: &mut Vec<Item>) -> Option<i64> {
    let briefed = num(get(v, "briefing"), "fetched_at").map(|t| t as i64);
    let age = briefed.map(|t| (now - t).max(0));
    out.push(match age {
        None => item(
            "briefing",
            false,
            "Get the weather briefing".into(),
            "No briefing yet".into(),
            "14 CFR 91.103(a)",
            Some("refresh_weather"),
        ),
        Some(a) if a >= BRIEFING_FRESH_S => item(
            "briefing",
            false,
            format!("Refresh weather, {} old", age_words(a)),
            "A new METAR is out every hour".into(),
            "App's choice, at AIM 7-1-28's hourly METAR",
            Some("refresh_weather"),
        ),
        Some(a) => item(
            "briefing",
            true,
            format!("Weather briefed {} ago", age_words(a)),
            "Fresh for an hour".into(),
            "App's choice, at AIM 7-1-28's hourly METAR",
            None,
        ),
    });
    let fields = v.get("fields").and_then(Value::as_array).unwrap_or(&[]);
    let mut missing: Vec<String> = Vec::new();
    let mut old: Vec<String> = Vec::new();
    for f in fields {
        let Some(ident) = text(Some(f), "ident") else { continue };
        match num(Some(f), "metar_observed") {
            None => missing.push(format!("{ident} METAR")),
            Some(t) if now >= t as i64 + ROUTINE_INTERVAL_S => old.push(format!("{ident} METAR")),
            _ => {}
        }
        if flag(Some(f), "taf") == Some(false) {
            missing.push(format!("{ident} TAF"));
        }
    }
    if !fields.is_empty() {
        let ok = missing.is_empty() && old.is_empty();
        let line = if !old.is_empty() {
            format!("Refresh weather: old {}", list(&old))
        } else if !missing.is_empty() {
            format!("No {}", list(&missing))
        } else {
            "METARs and TAFs for the route's fields".into()
        };
        let detail = if missing.is_empty() { "In force now".into() } else { "Not every field reports; check the nearest that do".into() };
        out.push(item("fields", ok, line, detail, "AIM 7-1-28; 14 CFR 91.103(a)", Some("refresh_weather")));
    }
    age
}

/// "a, b and c".
fn list(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

pub(super) fn notam_item(notams: Option<&Value>, now: i64) -> Item {
    const SOURCE: &str = "14 CFR 91.103; AIM 5-1-3; age the app's choice";
    match num(notams, "fetched_at").map(|t| (now - t as i64).max(0)) {
        None => item("notams", false, "Get the NOTAMs for the route".into(), "Not fetched yet".into(), SOURCE, Some("fetch_notams")),
        Some(a) if a >= NOTAMS_FRESH_S => item(
            "notams",
            false,
            format!("Refresh NOTAMs, {} old", age_words(a)),
            "A NOTAM may be issued at any time".into(),
            SOURCE,
            Some("fetch_notams"),
        ),
        Some(a) => item("notams", true, format!("NOTAMs fetched {} ago", age_words(a)), "For the route".into(), SOURCE, None),
    }
}

/// The device: the plan kept for offline, location, the battery where the
/// platform tells it, and a receiver where the pilot flies with one.
pub(super) fn device_items(v: &Value, out: &mut Vec<Item>) {
    let device = get(v, "device");
    if let Some(saved) = flag(device, "plan_saved") {
        out.push(item(
            "saved",
            saved,
            if saved { "Plan saved on this device" } else { "Save the plan for offline" }.into(),
            "It opens with no signal".into(),
            APP_CHOICE,
            Some("save_plan"),
        ));
    }
    match text(device, "location") {
        Some("granted") => out.push(item("location", true, "Location on".into(), "Your position on the map".into(), APP_CHOICE, None)),
        Some(_) => out.push(item(
            "location",
            false,
            "Allow location".into(),
            "For your position on the map".into(),
            APP_CHOICE,
            Some("allow_location"),
        )),
        None => {}
    }
    if let Some(pct) = num(device, "battery_pct") {
        let charging = flag(device, "charging").unwrap_or(false);
        let ok = charging || pct >= BATTERY_LOW_PCT;
        let line = if ok { format!("Battery {}%", pct.round() as i64) } else { format!("Charge the device, {}%", pct.round() as i64) };
        out.push(item("battery", ok, line, "Half charged or plugged in".into(), APP_CHOICE, None));
    }
    let receiver = get(v, "receiver");
    if flag(receiver, "used") == Some(true) {
        let on = flag(receiver, "connected").unwrap_or(false);
        let line = if on { "ADS-B receiver connected" } else { "Connect the ADS-B receiver" };
        out.push(item(
            "receiver",
            on,
            line.into(),
            "Traffic and FIS-B weather in the air".into(),
            "AIM 4-5-7, 4-5-9",
            Some("connect_receiver"),
        ));
    }
}
