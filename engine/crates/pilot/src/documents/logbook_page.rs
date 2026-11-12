//! `logbook_read_check`: a paper logbook page as read off a photograph,
//! each row a draft of the gateway's logbook entry (its
//! LogbookEntryRequest, camelCase, as logbook_from_track's draft is) with
//! what to check about it, and the page's own totals held to its rows.
//!
//! 14 CFR 61.51(b) is what an entry holds: (1) the date, the total flight
//! time, where it departed and arrived, the airplane's type and
//! identification; (2) the kind of time (solo, training received); (3) the
//! conditions (day or night, actual or simulated instrument). Each kind of
//! time is part of the flight's own, so none is longer than the total;
//! dual received and solo cannot overlap, since solo is being "the sole
//! occupant of an aircraft" (61.51(d)); an approach or a hold is logged
//! for 61.57(c) only "under actual or simulated instrument conditions"
//! (61.51(g)(1)), and a night landing, 61.57(b), at night.
//!
//! The engine has no clock: the caller gives `today`, its own date, and a
//! row dated after it is wrong.

use super::out::{array, check, figure, flags_json, wrong, Flag, Obj};
use crate::json::Value;

type R<T> = Result<T, String>;
const NAME: &str = "logbook_read_check";

/// The gateway's columns (LogbookEntryRequest, V12): longer is refused there.
const AIRCRAFT_CHARS: usize = 16;
const ROUTE_CHARS: usize = 120;
const REMARKS_CHARS: usize = 500;
/// The gateway's own most for one entry's hours: a day.
const MOST_HOURS: f64 = 24.0;

fn num(v: &Value, key: &str) -> R<f64> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(0.0),
        Some(Value::Number(n)) => Ok(*n),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a number")),
    }
}

fn text<'a>(v: &'a Value, key: &str) -> R<Option<&'a str>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.trim()).filter(|s| !s.is_empty())),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a string")),
    }
}

/// An ISO date (YYYY-MM-DD) that is a day of the calendar, from 1903 (the
/// first powered flight) on.
fn date(s: &str) -> Option<(i64, i64, i64)> {
    let p: Vec<&str> = s.split('-').collect();
    if p.len() != 3 || p[0].len() != 4 || p[1].len() != 2 || p[2].len() != 2 {
        return None;
    }
    let (y, m, d): (i64, i64, i64) = (p[0].parse().ok()?, p[1].parse().ok()?, p[2].parse().ok()?);
    // The month is checked before its length is asked (core's time, the
    // Gregorian calendar's leap years).
    (y >= 1903 && (1..=12).contains(&m) && d >= 1 && d <= i64::from(crate::time::days_in_month(y, m as u32))).then_some((y, m, d))
}

fn clip(s: Option<&str>, most: usize, what: &str, flags: &mut Vec<Flag>, field: &'static str) -> Option<String> {
    let s = s?;
    if s.chars().count() <= most {
        return Some(s.to_owned());
    }
    flags.push(Flag {
        field: Some(field),
        ..check(format!("The {what} is longer than the logbook keeps ({most} characters); it is cut there."))
    });
    Some(s.chars().take(most).collect())
}

/// The columns a page totals, as the row's members and the entry's.
const TOTALLED: [(&str, &str, &str); 9] = [
    ("total", "totalHours", "total time"),
    ("night", "nightHours", "night"),
    ("cross_country", "crossCountryHours", "cross-country"),
    ("dual", "dualHours", "dual received"),
    ("solo", "soloHours", "solo"),
    ("instrument", "instrumentHours", "instrument"),
    ("day_landings", "dayLandings", "day landings"),
    ("night_landings", "nightLandings", "night landings"),
    ("approaches", "approaches", "approaches"),
];

fn row(r: &Value, today: Option<(i64, i64, i64)>) -> R<(String, [f64; 9])> {
    let mut flags = Vec::new();
    let flag = |flags: &mut Vec<Flag>, f: Flag, field: &'static str| flags.push(Flag { field: Some(field), ..f });
    let on = text(r, "date")?;
    let day = on.and_then(date);
    match (on, day) {
        (None, _) => flag(&mut flags, wrong("No date was read (14 CFR 61.51(b)(1)(i)).".into()), "flownOn"),
        (Some(s), None) => flag(&mut flags, wrong(format!("\"{s}\" is not a date.")), "flownOn"),
        (Some(s), Some(d)) if today.is_some_and(|t| d > t) => flag(&mut flags, wrong(format!("{s} is after today.")), "flownOn"),
        _ => {}
    }
    let instrument = num(r, "instrument_actual")? + num(r, "instrument_simulated")?;
    let figures = [
        num(r, "total")?,
        num(r, "night")?,
        num(r, "cross_country")?,
        num(r, "dual")?,
        num(r, "solo")?,
        instrument,
        num(r, "day_landings")?,
        num(r, "night_landings")?,
        num(r, "approaches")?,
    ];
    let [total, night, xc, dual, solo, _, day_landings, night_landings, approaches] = figures;
    for (i, (_, field, what)) in TOTALLED.iter().enumerate() {
        if figures[i] < 0.0 {
            flag(&mut flags, wrong(format!("The {what} reads {}: none or more.", figure(figures[i]))), field);
        }
        if i >= 6 && figures[i].fract() != 0.0 {
            flag(&mut flags, wrong(format!("The {what} reads {}: a count is whole.", figure(figures[i]))), field);
        }
    }
    if total <= 0.0 {
        flag(&mut flags, wrong("No total time was read (14 CFR 61.51(b)(1)(ii)).".into()), "totalHours");
    } else if total > MOST_HOURS {
        flag(&mut flags, wrong(format!("The total reads {} hours, more than a day.", figure(total))), "totalHours");
    } else if total > 12.0 {
        flag(&mut flags, check(format!("The total reads {} hours: check the decimal point.", figure(total))), "totalHours");
    }
    for (i, (_, field, what)) in TOTALLED.iter().enumerate().take(6).skip(1) {
        if total > 0.0 && figures[i] > total + 1e-9 {
            flag(
                &mut flags,
                wrong(format!("The {what} ({} h) reads longer than the flight ({} h).", figure(figures[i]), figure(total))),
                field,
            );
        }
    }
    if dual + solo > total + 1e-9 && dual > 0.0 && solo > 0.0 {
        flag(
            &mut flags,
            wrong(format!(
                "Dual ({} h) and solo ({} h) add to more than the flight: solo is alone aboard (14 CFR 61.51(d)).",
                figure(dual),
                figure(solo)
            )),
            "soloHours",
        );
    }
    if night_landings > 0.0 && night == 0.0 {
        flag(&mut flags, check("Night landings with no night time (14 CFR 61.57(b)).".into()), "nightLandings");
    }
    if approaches > 0.0 && instrument == 0.0 {
        flag(
            &mut flags,
            check("Approaches with no instrument time: they count when flown by instruments (14 CFR 61.51(g)(1), 61.57(c)).".into()),
            "approaches",
        );
    }
    let holding = matches!(r.get("holding"), Some(Value::Bool(true)));
    if holding && instrument == 0.0 {
        flag(&mut flags, check("Holding with no instrument time (14 CFR 61.57(c)).".into()), "holding");
    }
    if total > 0.0 && day_landings + night_landings == 0.0 {
        flag(&mut flags, check("No landings were read.".into()), "dayLandings");
    } else if day_landings + night_landings > 50.0 {
        flag(&mut flags, check(format!("{} landings in one entry.", figure(day_landings + night_landings))), "dayLandings");
    }
    let (from, to) = (text(r, "from")?, text(r, "to")?);
    let via: Vec<&str> = match r.get("via") {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str()).map(str::trim).filter(|s| !s.is_empty()).collect(),
        _ => Vec::new(),
    };
    if from.is_none() || to.is_none() {
        flag(&mut flags, check("Where it departed or arrived was not read (14 CFR 61.51(b)(1)(iii)).".into()), "route");
    } else if xc > 0.0 && from == to && via.is_empty() {
        flag(
            &mut flags,
            check(
                "Cross-country time on a flight back to where it departed with no stop: it takes a landing elsewhere (14 CFR 61.1).".into(),
            ),
            "crossCountryHours",
        );
    }
    let route = [from.into_iter().collect::<Vec<_>>(), via, to.into_iter().collect()].concat().join(" ");
    let (id, kind) = (text(r, "aircraft_id")?, text(r, "aircraft_type")?);
    if id.is_none() && kind.is_none() {
        flag(&mut flags, check("The airplane was not read (14 CFR 61.51(b)(1)(iv)).".into()), "aircraft");
    }
    let aircraft = clip(id, AIRCRAFT_CHARS, "airplane's identification", &mut flags, "aircraft");
    let aircraft_type = clip(kind, AIRCRAFT_CHARS, "airplane's type", &mut flags, "aircraftType");
    let route = clip(Some(route.as_str()).filter(|s| !s.is_empty()), ROUTE_CHARS, "route", &mut flags, "route");
    let remarks = clip(text(r, "remarks")?, REMARKS_CHARS, "remarks", &mut flags, "remarks");
    let count = |x: f64| x.max(0.0).round();
    let hours = |x: f64| x.max(0.0);
    let entry = Obj::new()
        .text("flownOn", day.and(on))
        .text("aircraft", aircraft.as_deref())
        .text("aircraftType", aircraft_type.as_deref())
        .text("route", route.as_deref())
        .num("totalHours", hours(total).min(MOST_HOURS))
        .num("nightHours", hours(night))
        .num("crossCountryHours", hours(xc))
        .num("dayLandings", count(day_landings))
        .num("nightLandings", count(night_landings))
        .text("remarks", remarks.as_deref())
        .num("dualHours", hours(dual))
        .num("soloHours", hours(solo))
        .num("instrumentHours", hours(instrument))
        .num("toweredLandings", 0.0)
        .num("distanceNm", 0.0)
        .num("longestLegNm", 0.0)
        .num("approaches", count(approaches))
        .flag("holding", holding)
        .flag("tracking", false)
        .num("airHours", 0.0)
        .num("touchAndGoes", 0.0)
        .flag("fromTrack", false)
        .raw("flightId", "null")
        .done();
    Ok((Obj::new().raw("entry", &entry).raw("flags", &flags_json(&flags)).done(), figures))
}

/// The rule: `{"rows", "page_totals"?, "today"?}` in, `{"rows": [{"entry",
/// "flags"}], "flags"}` out, the page's flags for its totals.
pub fn check_page(v: &Value) -> R<String> {
    let today = text(v, "today")?.and_then(date);
    let rows = match v.get("rows") {
        Some(Value::Array(a)) => a.as_slice(),
        None | Some(Value::Null) => &[],
        Some(_) => return Err(format!("{NAME}: \"rows\" is not an array")),
    };
    let mut sums = [0.0; 9];
    let mut out = Vec::new();
    for r in rows {
        let (json, figures) = row(r, today)?;
        for (s, f) in sums.iter_mut().zip(figures) {
            *s += f;
        }
        out.push(json);
    }
    // A page's "total this page" is its rows added up: where it is not,
    // a figure is misread, on a row or in the total.
    let mut flags = Vec::new();
    if let Some(t @ Value::Object(_)) = v.get("page_totals") {
        let instrument = num(t, "instrument_actual")? + num(t, "instrument_simulated")?;
        for (i, (key, field, what)) in TOTALLED.iter().enumerate() {
            let given = if *key == "instrument" {
                (t.get("instrument_actual").is_some() || t.get("instrument_simulated").is_some()).then_some(instrument)
            } else {
                t.get(key).and_then(Value::as_f64)
            };
            if let Some(g) = given.filter(|g| (g - sums[i]).abs() > 0.05) {
                flags.push(Flag {
                    field: Some(field),
                    ..check(format!("The page's {what} total reads {}; its rows add to {}.", figure(g), figure(sums[i])))
                });
            }
        }
    }
    Ok(Obj::new().raw("rows", &array(out)).raw("flags", &flags_json(&flags)).done())
}
