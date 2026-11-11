//! What counts as the weather on a route getting worse between two
//! readings of its briefing: the one the pilot was briefed with and a
//! later one. The apps fetch both readings (the planner's briefing) and
//! tell the pilot; what is worse, and the words for it, are decided here,
//! once, for every app.
//!
//! Three things count, each a caution and never a limit (the owner,
//! 2026-10-23: warn, never limit):
//!
//! - A field's METAR in a worse flight category than before (AIM 7-1-7's
//!   categories, VFR, MVFR, IFR, LIFR, from `metar::flight_category_of`),
//!   and worse than VFR now. A field with no category before that has one
//!   worse than VFR now counts too: the pilot was not told of it.
//! - A SIGMET, AIRMET or G-AIRMET on the route that was not on it before
//!   (AIM 7-1-6, in-flight aviation weather advisories). One that has gone,
//!   or is near and not on the route, does not.
//! - A TAF where the flight lands forecasting a worse flight category for
//!   the flight's time there than it did, and worse than VFR (AIM 7-1-7).
//! - Either of those with a ceiling of unknown height now ("OVC///") that
//!   had none before: it has no category, yet it is a ceiling not known to
//!   be high enough (14 CFR 1.1 "ceiling"), so it is no longer VFR for
//!   sure -- the engine's forecast reading calls it "VFR not recommended"
//!   too (forecast/route.rs, AIM 7-1-5).
//!
//! Each change has a key that names it and its new state ("metar:KMSN:IFR"),
//! so an app tells a change once: the same field going IFR again is the
//! same key, a field going on to LIFR a new one.

use crate::forecast::rank;
use crate::json::{self, Value};
use crate::metar::flight_category_of;

type R<T> = Result<T, String>;

const CATEGORY_SOURCE: &str = "AIM 7-1-7 (flight categories)";
const ADVISORY_SOURCE: &str = "AIM 7-1-6 (SIGMETs, AIRMETs and G-AIRMETs)";
const CEILING_SOURCE: &str = "AIM 7-1-7 (flight categories); 14 CFR 1.1 (ceiling)";

/// One way the weather got worse.
#[derive(Clone, Debug, PartialEq)]
pub struct Worse {
    pub key: String,
    pub kind: &'static str,
    pub ident: Option<String>,
    pub was: Option<String>,
    pub now: Option<String>,
    pub line: String,
    pub source: &'static str,
}

/// A field's ceiling and visibility as a reading gives them, read into
/// its flight category.
struct Field {
    ident: String,
    category: Option<&'static str>,
    ceiling_unknown: bool,
    arrival: bool,
}

struct Advisory {
    key: String,
    kind: String,
    hazard: Option<String>,
    on_route: bool,
}

fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn flag(v: &Value, key: &str) -> bool {
    matches!(v.get(key), Some(Value::Bool(true)))
}

fn text(name: &str, v: &Value, key: &str) -> R<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned).ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn fields(name: &str, reading: &Value, key: &str) -> R<Vec<Field>> {
    list(name, reading, key)?
        .iter()
        .map(|f| {
            let category =
                flight_category_of(opt_num(name, f, "ceiling_ft")?, flag(f, "ceiling_unknown"), opt_num(name, f, "visibility_sm")?);
            Ok(Field { ident: text(name, f, "ident")?, category, ceiling_unknown: flag(f, "ceiling_unknown"), arrival: flag(f, "arrival") })
        })
        .collect()
}

fn advisories(name: &str, reading: &Value) -> R<Vec<Advisory>> {
    list(name, reading, "advisories")?
        .iter()
        .map(|a| {
            Ok(Advisory {
                key: text(name, a, "key")?,
                kind: text(name, a, "kind")?,
                hazard: a.get("hazard").and_then(Value::as_str).filter(|h| !h.trim().is_empty()).map(str::to_owned),
                on_route: flag(a, "on_route"),
            })
        })
        .collect()
}

/// Worse: a category further down AIM 7-1-7's list than before, and worse
/// than VFR now.
fn worse_category(was: Option<&str>, now: Option<&str>) -> bool {
    rank(now) > rank(was) && rank(now) >= rank(Some("MVFR"))
}

/// Worse too: a ceiling of unknown height now where there was none, and
/// not already told as a worse category.
fn newly_unknown(was: Option<&Field>, now: &Field) -> bool {
    now.ceiling_unknown && !was.is_some_and(|w| w.ceiling_unknown) && !worse_category(was.and_then(|w| w.category), now.category)
}

/// The change for a field whose ceiling's height is not known now.
fn unknown_ceiling(kind: &'static str, f: &Field, was: Option<&'static str>, what: &str) -> Worse {
    Worse {
        key: format!("{kind}:{}:ceiling-unknown", f.ident),
        kind,
        line: format!("{what} has a ceiling of unknown height now; {}", was_words(was)),
        ident: Some(f.ident.clone()),
        was: was.map(str::to_owned),
        now: f.category.map(str::to_owned),
        source: CEILING_SOURCE,
    }
}

fn was_words(was: Option<&str>) -> String {
    was.map_or_else(|| "it had no category at the briefing".to_owned(), |w| format!("it was {w} at the briefing"))
}

/// The ways `now` is worse than `then`, METARs first, then the
/// advisories, then the TAFs, each in the order `now` gives them.
pub fn worse(name: &str, then: &Value, now: &Value) -> R<Vec<Worse>> {
    let mut out = Vec::new();
    let before = fields(name, then, "metars")?;
    for f in fields(name, now, "metars")? {
        let had = before.iter().find(|b| b.ident == f.ident);
        let was = had.and_then(|b| b.category);
        if newly_unknown(had, &f) {
            out.push(unknown_ceiling("metar", &f, was, &f.ident));
            continue;
        }
        if worse_category(was, f.category) {
            let now = f.category.unwrap_or_default();
            out.push(Worse {
                key: format!("metar:{}:{now}", f.ident),
                kind: "metar",
                line: format!("{} is {now} now; {}", f.ident, was_words(was)),
                ident: Some(f.ident),
                was: was.map(str::to_owned),
                now: Some(now.to_owned()),
                source: CATEGORY_SOURCE,
            });
        }
    }
    let had = advisories(name, then)?;
    for a in advisories(name, now)? {
        if !a.on_route || had.iter().any(|h| h.on_route && h.key == a.key) {
            continue;
        }
        let what = a.hazard.as_deref().map_or_else(|| a.kind.clone(), |h| format!("{} ({h})", a.kind));
        out.push(Worse {
            key: format!("advisory:{}", a.key),
            kind: "advisory",
            ident: None,
            was: None,
            now: a.hazard.clone(),
            line: format!("A new {what} is on the route"),
            source: ADVISORY_SOURCE,
        });
    }
    let forecast = fields(name, then, "tafs")?;
    for f in fields(name, now, "tafs")?.into_iter().filter(|f| f.arrival) {
        // Only a TAF read both times is compared: a station new to the
        // briefing has no forecast the pilot was told of to be worse than.
        let Some(b) = forecast.iter().find(|b| b.ident == f.ident) else { continue };
        if newly_unknown(Some(b), &f) {
            out.push(unknown_ceiling("taf", &f, b.category, &format!("{}'s TAF for your arrival", f.ident)));
            continue;
        }
        if worse_category(b.category, f.category) {
            let now = f.category.unwrap_or_default();
            out.push(Worse {
                key: format!("taf:{}:{now}", f.ident),
                kind: "taf",
                line: format!("{}'s TAF for your arrival is {now} now; {}", f.ident, was_words(b.category)),
                ident: Some(f.ident),
                was: b.category.map(str::to_owned),
                now: Some(now.to_owned()),
                source: CATEGORY_SOURCE,
            });
        }
    }
    Ok(out)
}

/// `weather_worse`: {"then": reading, "now": reading} in, {"worse": [...]}
/// out.
pub fn call(name: &str, v: &Value) -> R<String> {
    let then = v.get("then").ok_or_else(|| format!("{name}: \"then\" is missing"))?;
    let now = v.get("now").ok_or_else(|| format!("{name}: \"now\" is missing"))?;
    let mut out = String::from("{\"worse\":[");
    for (i, w) in worse(name, then, now)?.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"key\":");
        json::string(&mut out, &w.key);
        out.push_str(",\"kind\":");
        json::string(&mut out, w.kind);
        out.push_str(",\"ident\":");
        json::opt_string(&mut out, w.ident.as_deref());
        out.push_str(",\"was\":");
        json::opt_string(&mut out, w.was.as_deref());
        out.push_str(",\"now\":");
        json::opt_string(&mut out, w.now.as_deref());
        out.push_str(",\"line\":");
        json::string(&mut out, &w.line);
        out.push_str(",\"source\":");
        json::string(&mut out, w.source);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(text: &str) -> Value {
        json::parse(text).unwrap()
    }

    #[test]
    fn a_field_gone_ifr_is_worse_and_one_gone_better_is_not() {
        let then = read(
            r#"{"metars":[{"ident":"KMSN","ceiling_ft":5000,"visibility_sm":10},{"ident":"KDLH","ceiling_ft":800,"visibility_sm":2}]}"#,
        );
        let now = read(
            r#"{"metars":[{"ident":"KMSN","ceiling_ft":800,"visibility_sm":10},{"ident":"KDLH","ceiling_ft":5000,"visibility_sm":10}]}"#,
        );
        let w = worse("t", &then, &now).unwrap();
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].key, "metar:KMSN:IFR");
        assert_eq!(w[0].line, "KMSN is IFR now; it was VFR at the briefing");
    }

    #[test]
    fn an_advisory_counts_once_on_the_route() {
        let then = read(r#"{"advisories":[{"key":"a","kind":"AIRMET","hazard":"IFR","on_route":true}]}"#);
        let now = read(
            r#"{"advisories":[{"key":"a","kind":"AIRMET","hazard":"IFR","on_route":true},{"key":"b","kind":"SIGMET","hazard":"TURB","on_route":true},{"key":"c","kind":"SIGMET","on_route":false}]}"#,
        );
        let w = worse("t", &then, &now).unwrap();
        assert_eq!(w.iter().map(|w| w.key.as_str()).collect::<Vec<_>>(), ["advisory:b"]);
        assert_eq!(w[0].line, "A new SIGMET (TURB) is on the route");
    }

    #[test]
    fn only_a_taf_where_the_flight_lands_and_read_both_times_counts() {
        let then = read(r#"{"tafs":[{"ident":"KDLH","ceiling_ft":4000,"visibility_sm":6,"arrival":true}]}"#);
        let now = read(
            r#"{"tafs":[{"ident":"KDLH","ceiling_ft":2000,"visibility_sm":6,"arrival":true},{"ident":"KHIB","ceiling_ft":400,"visibility_sm":1,"arrival":true},{"ident":"KMSP","ceiling_ft":400,"visibility_sm":1}]}"#,
        );
        let w = worse("t", &then, &now).unwrap();
        assert_eq!(w.iter().map(|w| w.key.as_str()).collect::<Vec<_>>(), ["taf:KDLH:MVFR"]);
    }
}
