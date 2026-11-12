//! Whether an accident or incident report and an ADS-B track are the same
//! airplane at the same time and place: the identity check the Studio's
//! crash drafts are held to (docs/STUDIO-PIPELINE.md) before a draft is
//! made, so a film never shows the wrong airplane's flight.
//!
//! Three sources must agree, each one independent of the others:
//!
//! 1. The report's N-number (the FAA's statement or preliminary notice,
//!    or the NTSB's record) is in the FAA's aircraft registry, which gives
//!    the airplane's Mode S code (the registry's MASTER file, "MODE S CODE
//!    HEX": the ICAO 24-bit address the FAA assigns with the registration).
//! 2. The ADS-B track is that address's. adsb.lol writes an address it did
//!    not hear from the airplane itself (TIS-B, ADS-R) with a "~" before it,
//!    which is never the registry's, so it never agrees.
//! 3. The track has a report inside the window the report's time gives, and
//!    near the place it names.
//!
//! The tolerances are this check's own judgment, not a regulation: nothing
//! in 14 CFR or 49 CFR says how near a track must come to a reported place.
//! They are wide enough for what the sources leave out, and no wider:
//!
//! - ADS-B's own position is not the doubt. 14 CFR 91.227(c)(1)(i) holds a
//!   transmitter to a NACp under 0.05 nm, so the miles below are for the
//!   report's place and the receivers' coverage, not the airplane's fix.
//! - The FAA's statements give the time "around" a local clock time, to
//!   the nearest five minutes, and the time it was told of, which is never
//!   before the event: the window opens WINDOW_BEFORE_MIN before the time
//!   given and closes WINDOW_AFTER_MIN after it. A receiver network loses a
//!   low airplane minutes before it reaches the ground far from its
//!   stations, so the last reports heard may be well before the time.
//! - Without a clock time, or one the statement gives with no a.m. or p.m.,
//!   the window is the whole local day.
//! - The place is the town the statement names (the Census Bureau's
//!   internal point of it, wingtip.geocode) or a point the NTSB gives. A
//!   town's point may be miles from a field outside it, so a town is given
//!   TOWN_NM and a point POINT_NM; both carry COVERAGE_NM for the reports
//!   lost low before the place.
//! - A local date and time are read at each offset from UTC the place may
//!   have that day (a state with two zones, and summer time, given by the
//!   caller from the IANA zones); unknown, at every offset the United
//!   States keeps, UTC-11 (Samoa) to UTC+10 (Chamorro), 49 CFR part 71.
//!
//! The verdict errs toward a person looking: "confirmed" only when all
//! three agree; "no_track" where the registry agrees and the track has no
//! report in the window (a draft of the place alone, marked "No ADS-B
//! track", never a guessed path); "needs_human" for anything else.

use wingtip_core::geo::distance_nm;
use wingtip_core::json::{self, Value};
use wingtip_core::time::{days_from_civil, DAY_S};

/// The window opens this long before the time the report gives, minutes.
pub const WINDOW_BEFORE_MIN: f64 = 60.0;
/// And closes this long after it: the time given is when the FAA was told,
/// rounded to five minutes, never before the event.
pub const WINDOW_AFTER_MIN: f64 = 15.0;
/// Reports lost low before the place: receivers' coverage, nm.
pub const COVERAGE_NM: f64 = 10.0;
/// A town's internal point against a field at its edge, nm.
pub const TOWN_NM: f64 = 10.0;
/// A point the NTSB gives, to the minute of arc it is written in, nm.
pub const POINT_NM: f64 = 0.5;
/// The United States' offsets from UTC, minutes: Samoa standard time
/// (UTC-11) to Chamorro standard time (UTC+10), 49 CFR part 71.
pub const US_OFFSETS_MIN: [f64; 2] = [-660.0, 600.0];

/// How precise the report's place is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Place {
    /// A town's internal point.
    Town,
    /// A point the record gives.
    Point,
}

impl Place {
    /// How near a track's report must come to the place, nm.
    pub fn within_nm(self) -> f64 {
        COVERAGE_NM
            + match self {
                Place::Town => TOWN_NM,
                Place::Point => POINT_NM,
            }
    }
}

/// One report of the track: when (s since 1970) and where.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fix {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
}

/// What the report says.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    pub n_number: Option<String>,
    /// The local date, days since 1970.
    pub day: i64,
    /// The local clock time, minutes after midnight, where it is given.
    pub minute: Option<f64>,
    /// The offsets from UTC the place may have that day, minutes.
    pub offsets_min: Vec<f64>,
    pub lat: f64,
    pub lon: f64,
    pub place: Place,
}

/// One check and what it found.
#[derive(Clone, Debug, PartialEq)]
pub struct Check {
    pub check: &'static str,
    pub ok: bool,
    pub words: String,
}

/// The check's answer.
#[derive(Clone, Debug, PartialEq)]
pub struct Identity {
    pub verdict: &'static str,
    pub checks: Vec<Check>,
    /// The window a report of the track must fall in, s since 1970.
    pub window: (f64, f64),
    pub within_nm: f64,
    /// The report in the window nearest the place, with its distance.
    pub nearest: Option<(Fix, f64)>,
}

/// "N-123ab" as the registry writes it, "N123AB".
fn n_number(text: &str) -> String {
    let t: String = text.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase();
    if t.starts_with('N') {
        t
    } else {
        format!("N{t}")
    }
}

/// The window in UTC, s since 1970, over every offset the place may have.
pub fn window(report: &Report) -> (f64, f64) {
    let offsets: &[f64] = if report.offsets_min.is_empty() { &US_OFFSETS_MIN } else { &report.offsets_min };
    let midnight = (report.day * DAY_S) as f64;
    let (mut start, mut end) = (f64::INFINITY, f64::NEG_INFINITY);
    for offset in offsets {
        // Local time less its offset is UTC: 14:25 at UTC-6 is 20:25Z.
        let (a, b) = match report.minute {
            Some(m) => (m - WINDOW_BEFORE_MIN - offset, m + WINDOW_AFTER_MIN - offset),
            None => (-offset, 24.0 * 60.0 - offset),
        };
        start = start.min(midnight + a * 60.0);
        end = end.max(midnight + b * 60.0);
    }
    (start, end)
}

/// The identity check of `report` against the registry's answer for its
/// N-number (`registry`: the N-number and its Mode S code) and the ADS-B
/// track of that day (`track`: its address and reports).
pub fn identity(report: &Report, registry: Option<(&str, &str)>, track: Option<(&str, &[Fix])>) -> Identity {
    let window = window(report);
    let within_nm = report.place.within_nm();
    let mut answer = Identity { verdict: "needs_human", checks: Vec::new(), window, within_nm, nearest: None };
    let check = |name: &'static str, ok: bool, words: String| Check { check: name, ok, words };

    let reported = report.n_number.as_deref().map(n_number);
    let hex = match (&reported, registry) {
        (None, _) => {
            answer.checks.push(check("registry", false, "The report gives no N-number.".to_owned()));
            return answer;
        }
        (Some(n), Some((reg_n, hex))) if n_number(reg_n) == *n && !hex.trim().is_empty() => {
            let hex = hex.trim().to_lowercase();
            answer.checks.push(check("registry", true, format!("{n} is in the FAA's registry, Mode S code {}.", hex.to_uppercase())));
            hex
        }
        (Some(n), Some(_)) => {
            answer.checks.push(check("registry", false, format!("The FAA's registry gives no Mode S code for {n}.")));
            return answer;
        }
        (Some(n), None) => {
            answer.checks.push(check("registry", false, format!("{n} is not in the FAA's registry.")));
            return answer;
        }
    };

    let Some((track_hex, fixes)) = track.filter(|(_, f)| !f.is_empty()) else {
        answer.verdict = "no_track";
        answer.checks.push(check("track", false, "No ADS-B track that day.".to_owned()));
        return answer;
    };
    if track_hex.trim().to_lowercase() != hex {
        answer.checks.push(check(
            "address",
            false,
            format!("The track is {}'s, not {}'s.", track_hex.trim().to_uppercase(), hex.to_uppercase()),
        ));
        return answer;
    }
    answer.checks.push(check("address", true, format!("The track is {}'s.", hex.to_uppercase())));

    let mut nearest: Option<(Fix, f64)> = None;
    for fix in fixes.iter().filter(|f| f.t >= window.0 && f.t <= window.1) {
        let d = distance_nm(report.lat, report.lon, fix.lat, fix.lon);
        if nearest.is_none_or(|(_, best)| d < best) {
            nearest = Some((*fix, d));
        }
    }
    let Some((_, d)) = nearest else {
        answer.verdict = "no_track";
        answer.checks.push(check("window", false, "No ADS-B reports in the report's time window.".to_owned()));
        return answer;
    };
    answer.nearest = nearest;
    answer.checks.push(check("window", true, "The track has reports in the report's time window.".to_owned()));
    if d <= within_nm {
        answer.verdict = "confirmed";
        answer.checks.push(check("place", true, format!("Its nearest report is {d:.1} nm from the place, within {within_nm:.1}.")));
    } else {
        answer.checks.push(check("place", false, format!("Its nearest report is {d:.1} nm from the place, more than {within_nm:.1}.")));
    }
    answer
}

fn number(v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("occurrence_identity: \"{key}\" is not a number"))
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}

/// "2026-11-08" as days since 1970.
fn day_of(text: &str) -> Option<i64> {
    let mut parts = text.trim().split('-');
    let (y, m, d) = (parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next()?.parse().ok()?);
    (parts.next().is_none() && (1..=12).contains(&m) && (1..=31).contains(&d)).then(|| days_from_civil(y, m, d))
}

/// "14:25" as minutes after midnight.
fn minute_of(text: &str) -> Option<f64> {
    let (h, m) = text.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(f64::from(h * 60 + m))
}

fn read_report(v: &Value) -> Result<Report, String> {
    let day = text(v, "date").and_then(day_of).ok_or("occurrence_identity: \"report.date\" is not a date (YYYY-MM-DD)")?;
    let minute = match text(v, "time") {
        None => None,
        Some(t) => Some(minute_of(t).ok_or("occurrence_identity: \"report.time\" is not HH:MM")?),
    };
    let offsets_min = v.get("utc_offsets_min").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_f64).collect();
    let place = match text(v, "place") {
        Some("point") => Place::Point,
        Some("town") => Place::Town,
        _ => return Err("occurrence_identity: \"report.place\" is town or point".to_owned()),
    };
    Ok(Report {
        n_number: text(v, "n_number").map(str::to_owned),
        day,
        minute,
        offsets_min,
        lat: number(v, "lat")?,
        lon: number(v, "lon")?,
        place,
    })
}

fn read_fixes(v: &Value) -> Vec<Fix> {
    v.get("points")
        .and_then(Value::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(|p| Some(Fix { t: p.get("t")?.as_f64()?, lat: p.get("lat")?.as_f64()?, lon: p.get("lon")?.as_f64()? }))
        .collect()
}

/// The rule `occurrence_identity`: `{"report": {"n_number"?, "date",
/// "time"?, "utc_offsets_min"?, "lat", "lon", "place"}, "registry"?:
/// {"n_number", "hex"}, "track"?: {"hex", "points": [{"t", "lat", "lon"}]}}`
/// to `{"verdict", "checks", "window", "within_nm", "nearest"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "occurrence_identity" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let report = read_report(v.get("report").ok_or("occurrence_identity: \"report\" is missing")?)?;
    let registry = v.get("registry").and_then(|r| Some((text(r, "n_number")?, text(r, "hex").unwrap_or(""))));
    let fixes;
    let track = match v.get("track") {
        Some(t @ Value::Object(_)) => {
            fixes = read_fixes(t);
            Some((text(t, "hex").unwrap_or(""), fixes.as_slice()))
        }
        _ => None,
    };
    let found = identity(&report, registry, track);
    let mut out = String::from("{\"verdict\":");
    json::string(&mut out, found.verdict);
    out.push_str(",\"checks\":[");
    for (i, c) in found.checks.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"check\":");
        json::string(&mut out, c.check);
        out.push_str(",\"ok\":");
        out.push_str(if c.ok { "true" } else { "false" });
        out.push_str(",\"words\":");
        json::string(&mut out, &c.words);
        out.push('}');
    }
    out.push_str("],\"window\":{\"start\":");
    json::number(&mut out, found.window.0);
    out.push_str(",\"end\":");
    json::number(&mut out, found.window.1);
    out.push_str("},\"within_nm\":");
    json::number(&mut out, found.within_nm);
    out.push_str(",\"nearest\":");
    match found.nearest {
        None => out.push_str("null"),
        Some((fix, d)) => {
            out.push_str("{\"t\":");
            json::number(&mut out, fix.t);
            out.push_str(",\"lat\":");
            json::number(&mut out, fix.lat);
            out.push_str(",\"lon\":");
            json::number(&mut out, fix.lon);
            out.push_str(",\"distance_nm\":");
            json::number(&mut out, (d * 10.0).round() / 10.0);
            out.push('}');
        }
    }
    out.push('}');
    Ok(out)
}

#[cfg(test)]
#[path = "occurrence_tests.rs"]
mod tests;
