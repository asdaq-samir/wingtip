//! When a part-time surface area is in effect, day by day: the airport
//! card's Airspace fact ("G after 22:00") and its Airspace hours (2026-11-14).
//!
//! The hours are NASR's CLS_ARSP.csv AIRSPACE_HRS, the Chart Supplement's
//! AIRSPACE line: "CLASS D SVC 0600-2200 MON-FRI, 0700-2200 SAT-SUN; OTHER
//! TIMES CLASS E" (KPWK). "Class D surface areas may be designated as
//! full-time ... or part-time ... Where a Class D surface area is
//! part-time, the airspace may revert to either a Class E surface area ...
//! or Class G airspace", and the Chart Supplement "will state the
//! part-time surface area status (for example, 'other times CLASS E' or
//! 'other times CLASS G')" (AIM 3-2-5a1; 14 CFR 71.61, 71.71(b)): the class
//! at other times is the one the line names, never a guess.
//!
//! Times: a figure with "Z" is UTC; "Z++" is the Chart Supplement's "‡",
//! "during periods of Daylight Saving Time (DST) effective hours will be
//! one hour earlier than shown" (Chart Supplement legend, Time
//! Conversion), so its local time is the figure at the field's standard
//! offset all year. A figure with no "Z" is the field's local time, as
//! NASR writes its tower hours (ATC_BASE TWR_HRS: KPWK's "0600-2200
//! MON-FRI & 0700-2200 SAT-SUN", KLVK's "0700-2100", the towers' local
//! hours). A day named with a UTC time is read as the local day its
//! service starts on, a simplification of an hour at most at the day's
//! edge.
//!
//! What is read: CONTINUOUS; a time range; days (MON-FRI, SAT-SUN, SAT &
//! SUN, WKEND, FRI-MON round the week); seasons ("16 MAR-31 OCT", "OCT-MAR",
//! "MAY 15-AUG 31"). Anything else -- holidays ("CLSD HOL"), "BY NOTAM",
//! sunrise to sunset, "DURING TWR HRS" -- leaves the hours not known, and
//! the card says "Part-time" alone rather than hours that may be wrong.
//! The host gives the field's local date, time and UTC offset (the engine
//! has no clock).

use crate::json::Value;
use wingtip_core::ask::Ask;

const MONTHS: [&str; 12] = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS: [&str; 7] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_MIN: i32 = 1440;
/// A season's first and last (month, day).
type Season = ((u32, u32), (u32, u32));

/// One item of the line: when (a season, as (month, day) bounds), on
/// which days (Monday 0), and the span, minutes from the local midnight.
#[derive(Debug, Clone)]
struct Item {
    season: Option<Season>,
    days: Option<[bool; 7]>,
    from: i32,
    to: i32,
}

/// The line read: its items (None where any part is not read) and the class at other times.
pub struct Schedule {
    items: Option<Vec<Item>>,
    pub other: Option<char>,
}

fn month(t: &str) -> Option<u32> {
    MONTHS.iter().position(|m| *m == t).map(|i| i as u32 + 1)
}

fn day(t: &str) -> Option<usize> {
    let t = if t == "THUR" || t == "THURS" { "THU" } else { t };
    DAYS.iter().position(|d| *d == t)
}

/// "0600" or "2200Z" or "2200Z++": minutes from midnight, and whether UTC
/// and whether ‡.
fn time(t: &str) -> Option<(i32, bool, bool)> {
    let (digits, rest) = (t.get(..4)?, t.get(4..)?);
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (h, m) = (digits[..2].parse::<i32>().ok()?, digits[2..].parse::<i32>().ok()?);
    if h > 24 || m > 59 {
        return None;
    }
    match rest {
        "" => Some((h * 60 + m, false, false)),
        "Z" => Some((h * 60 + m, true, false)),
        "Z++" => Some((h * 60 + m, true, true)),
        _ => None,
    }
}

/// One item's tokens, offsets in minutes: `now` the UTC offset in force,
/// `standard` the field's standard one.
fn item(tokens: &[&str], now: i32, standard: i32) -> Option<Item> {
    let (mut season, mut days, mut span) = (None, None::<[bool; 7]>, None);
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i];
        let next = |k: usize| tokens.get(i + k).copied().unwrap_or("");
        if let (Some(a), "-", Some(b)) = (time(t), next(1), time(next(2))) {
            // The suffix is written on the range's end: "0600-2200Z++".
            let offset = if !b.1 {
                0
            } else if b.2 {
                standard
            } else {
                now
            };
            span = Some(((a.0 + offset).rem_euclid(DAY_MIN), (b.0 + offset).rem_euclid(DAY_MIN)));
            i += 3;
        } else if let Some(d) = day(t) {
            let set = days.get_or_insert([false; 7]);
            if next(1) == "-" {
                let e = day(next(2))?;
                let mut k = d;
                loop {
                    set[k] = true;
                    if k == e {
                        break;
                    }
                    k = (k + 1) % 7;
                }
                i += 3;
            } else {
                set[d] = true;
                i += 1;
            }
        } else if t == "&" || t == "AND" {
            i += 1;
        } else if t == "WKEND" || t == "WKENDS" {
            let set = days.get_or_insert([false; 7]);
            set[5] = true;
            set[6] = true;
            i += 1;
        } else if let Some((s, used)) = season_at(&tokens[i..]) {
            season = Some(s);
            i += used;
        } else {
            return None;
        }
    }
    let (from, to) = span?;
    Some(Item { season, days, from, to })
}

/// A season at the start of `t`: "16 MAR - 31 OCT", "MAY 15 - AUG 31" or
/// "OCT - MAR" or "SEP 1 - 30", and how many tokens it took.
fn season_at(t: &[&str]) -> Option<(Season, usize)> {
    let num = |s: &str| s.parse::<u32>().ok().filter(|n| (1..=31).contains(n));
    let g = |k: usize| t.get(k).copied().unwrap_or("");
    if let (Some(d1), Some(m1), "-", Some(d2), Some(m2)) = (num(g(0)), month(g(1)), g(2), num(g(3)), month(g(4))) {
        return Some((((m1, d1), (m2, d2)), 5));
    }
    if let (Some(m1), Some(d1), "-", Some(m2), Some(d2)) = (month(g(0)), num(g(1)), g(2), month(g(3)), num(g(4))) {
        return Some((((m1, d1), (m2, d2)), 5));
    }
    if let (Some(m), Some(d1), "-", Some(d2)) = (month(g(0)), num(g(1)), g(2), num(g(3))) {
        return Some((((m, d1), (m, d2)), 4));
    }
    if let (Some(m1), "-", Some(m2)) = (month(g(0)), g(1), month(g(2))) {
        return Some((((m1, 1), (m2, 31)), 3));
    }
    None
}

/// The line read, at the field's UTC offset now and whether it is in
/// daylight saving time.
pub fn schedule(hours: &str, utc_offset_min: i32, dst: bool) -> Schedule {
    let text = hours.to_ascii_uppercase().replace('-', " - ").replace('&', " & ").replace('.', " ");
    let other =
        text.find("OTHER TIMES CLASS ").and_then(|at| text[at + 18..].chars().next()).filter(|c| matches!(c, 'B' | 'C' | 'D' | 'E' | 'G'));
    let standard = utc_offset_min - if dst { 60 } else { 0 };
    let mut items = Some(Vec::new());
    // The class at other times is said once, with or without a ";" before it.
    let text = text.find("OTHER TIMES CLASS ").map_or(text.as_str(), |at| &text[..at]);
    for part in text.split([',', ';']) {
        let words: Vec<&str> = part.split_whitespace().collect();
        // "CLASS D SVC" (or "CLASS D AIRSPACE", or "CLASS D") opens the line.
        let words = match words.as_slice() {
            ["CLASS", _, "SVC" | "AIRSPACE", rest @ ..] | ["CLASS", _, rest @ ..] if words[1].len() == 1 => rest.to_vec(),
            _ => words,
        };
        if words.is_empty() || words.starts_with(&["OTHER", "TIMES", "CLASS"]) && words.len() == 4 {
            continue;
        }
        let read = if words == ["CONTINUOUS"] {
            Some(Item { season: None, days: None, from: 0, to: DAY_MIN })
        } else {
            item(&words, utc_offset_min, standard)
        };
        match (read, items.as_mut()) {
            (Some(it), Some(list)) => list.push(it),
            _ => items = None,
        }
    }
    Schedule { items: items.filter(|v| !v.is_empty()), other }
}

fn in_season(s: Season, date: (u32, u32)) -> bool {
    let (a, b) = s;
    if a <= b {
        a <= date && date <= b
    } else {
        date >= a || date <= b
    }
}

/// The spans a day's own items give, as written (a span may end past
/// midnight, `to` under `from`); None where its hours are not known.
fn own(items: &[Item], date: (u32, u32), weekday: usize) -> Option<Vec<(i32, i32)>> {
    let seasonal = items.iter().any(|i| i.season.is_some());
    let fits: Vec<&Item> = items.iter().filter(|i| i.season.is_none_or(|s| in_season(s, date))).collect();
    if seasonal && !fits.iter().any(|i| i.season.is_some()) {
        return None;
    }
    Some(fits.iter().filter(|i| i.days.is_none_or(|d| d[weekday])).map(|i| (i.from, i.to)).collect())
}

/// Each day's spans in effect, local minutes [from, to), a span past
/// midnight carried into the next day; None for a day not known.
pub fn days(s: &Schedule, dates: &[((u32, u32), usize)]) -> Vec<Option<Vec<(i32, i32)>>> {
    let Some(items) = &s.items else { return vec![None; dates.len()] };
    let raw: Vec<Option<Vec<(i32, i32)>>> = dates.iter().map(|&(d, w)| own(items, d, w)).collect();
    (0..dates.len())
        .map(|k| {
            let mine = raw[k].as_ref()?;
            let mut spans: Vec<(i32, i32)> = mine.iter().map(|&(f, t)| (f, if t <= f { DAY_MIN } else { t })).collect();
            if k > 0 {
                let before = raw[k - 1].as_ref()?;
                spans.extend(before.iter().filter(|(f, t)| t < f && *t > 0).map(|&(_, t)| (0, t)));
            }
            spans.sort_unstable();
            Some(spans)
        })
        .collect()
}

/// Today's state from `minute`: in effect and until when, or from when
/// next (today's or the next day's), in local minutes; None not known.
pub fn now(days: &[Option<Vec<(i32, i32)>>], minute: i32) -> Option<(bool, Option<(i32, bool)>)> {
    let today = days.first()?.as_ref()?;
    let tomorrow = days.get(1).and_then(|d| d.as_ref());
    if let Some(&(_, to)) = today.iter().find(|(f, t)| *f <= minute && minute < *t) {
        // Through midnight, it ends where tomorrow's first span from 00:00 does.
        if to == DAY_MIN {
            return Some((
                true,
                tomorrow.and_then(|t| t.iter().find(|(f, _)| *f == 0)).map(|&(_, e)| (e, true)).filter(|(e, _)| *e < DAY_MIN),
            ));
        }
        return Some((true, Some((to, false))));
    }
    let next = today.iter().find(|(f, _)| *f > minute).map(|&(f, _)| (f, false));
    Some((false, next.or_else(|| tomorrow.and_then(|t| t.first()).map(|&(f, _)| (f, true)))))
}

/// The date `k` days after (m, d) of `year`, -1 the day before.
fn date_after((m, d): (u32, u32), year: i32, k: i32) -> (u32, u32) {
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let length = |m: u32| -> i32 { [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(m as usize + 11) % 12] };
    let (mut m, mut d) = (m, d as i32 + k);
    while d < 1 {
        m = if m == 1 { 12 } else { m - 1 };
        d += length(m);
    }
    while d > length(m) {
        d -= length(m);
        m = m % 12 + 1;
    }
    (m, d as u32)
}

/// `surface_hours`: `{hours, year, month, day, weekday, minute,
/// utc_offset_min, dst}` to `{known, other, days: [{weekday, spans:
/// [{from, to}] | null}] from today for a week, in_force, change}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let int = |k: &str| -> Result<i32, String> { Ok(ask.num(k)? as i32) };
    let (year, weekday, minute) = (int("year")?, int("weekday")?.rem_euclid(7) as usize, int("minute")?);
    let date = (int("month")?.clamp(1, 12) as u32, int("day")?.clamp(1, 31) as u32);
    let s = schedule(ask.opt_str("hours")?, int("utc_offset_min")?, ask.opt_bool("dst")?);
    // Yesterday first, for a span it carries past midnight; then the week and a day.
    let dates: Vec<((u32, u32), usize)> =
        (-1..8).map(|k| (date_after(date, year, k), (weekday as i32 + k).rem_euclid(7) as usize)).collect();
    let week: Vec<Option<Vec<(i32, i32)>>> = days(&s, &dates).into_iter().skip(1).collect();
    let state = now(&week, minute);
    let other = s.other.map_or("null".to_owned(), |c| format!("\"{c}\""));
    let mut out = format!("{{\"known\":{},\"other\":{other},\"days\":[", s.items.is_some());
    for (k, spans) in week.iter().take(7).enumerate() {
        let each = spans.as_ref().map_or("null".to_owned(), |list| {
            format!("[{}]", list.iter().map(|(f, t)| format!("{{\"from\":{f},\"to\":{t}}}")).collect::<Vec<_>>().join(","))
        });
        out.push_str(&format!("{}{{\"weekday\":{},\"spans\":{each}}}", if k > 0 { "," } else { "" }, (weekday + k) % 7));
    }
    let on = state.map_or("null".to_owned(), |(on, _)| on.to_string());
    let change = match state {
        Some((_, Some((at, next_day)))) => format!("{{\"at\":{at},\"next_day\":{next_day}}}"),
        _ => "null".to_owned(),
    };
    out.push_str(&format!("],\"in_force\":{on},\"change\":{change}}}"));
    Ok(out)
}

#[cfg(test)]
#[path = "surface_hours_tests.rs"]
mod tests;
