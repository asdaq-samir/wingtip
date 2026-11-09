//! What the device kept for the air, and how old it is: the route's
//! briefing, METARs and TAFs, NOTAMs, airport cards, plates, the plan and
//! its nav log, the Go / No-Go and the weather loop's frames, each the
//! last good answer the app had, shown with no signal with its age.
//!
//! How old is too old is ready to fly's own (ready/mod.rs), not a second
//! set of limits: the weather, the plan worked from it and the Go / No-Go
//! for the briefing's hour (`BRIEFING_FRESH_S`, AIM 7-1-28's hourly
//! METAR), the NOTAMs for theirs (`NOTAMS_FRESH_S`), and the airport cards
//! and plates for the AIRAC cycle they came in (FAA 28 and 56 Day Product
//! Schedule), as the cycle packs are. Past it the age is a caution, never a
//! stop (the owner, 2026-10-23: warn, never limit): the pilot still sees
//! the answer.

use super::{age_words, list, num, text, Item, BRIEFING_FRESH_S, NOTAMS_FRESH_S};
use crate::cycles::{self, Kind};
use crate::json::{self, Value};
use crate::validity::ROUTINE_INTERVAL_S;

type R<T> = Result<T, String>;

/// How long a kind of kept answer counts as fresh: seconds, or the AIRAC
/// cycle it came in.
enum Fresh {
    For(i64, &'static str),
    Cycle,
}

const CYCLE_SOURCE: &str = "FAA 28 and 56 Day Product Schedule; 14 CFR 91.103";

/// Each kind the apps keep: its name in the contract, its words, and how
/// long it is fresh.
const KINDS: [(&str, &str, Fresh); 8] = [
    ("briefing", "briefing", Fresh::For(BRIEFING_FRESH_S, "App's choice, at AIM 7-1-28's hourly METAR")),
    ("weather", "METARs and TAFs", Fresh::For(ROUTINE_INTERVAL_S, "AIM 7-1-28; 14 CFR 91.103(a)")),
    ("notams", "NOTAMs", Fresh::For(NOTAMS_FRESH_S, "14 CFR 91.103; AIM 5-1-3; age the app's choice")),
    ("airports", "airport cards", Fresh::Cycle),
    ("plates", "plates", Fresh::Cycle),
    // The nav log's winds, the Go / No-Go and the loop are all of the
    // briefing's weather: fresh as it is.
    ("plan", "plan and nav log", Fresh::For(BRIEFING_FRESH_S, "Its winds are the briefing's; AIM 7-1-28")),
    ("go_no_go", "Go / No-Go", Fresh::For(BRIEFING_FRESH_S, "Its weather is the briefing's; AIM 7-1-28")),
    ("weather_loop", "weather loop", Fresh::For(BRIEFING_FRESH_S, "App's choice, at AIM 7-1-28's hourly METAR")),
];

fn kind(name: &str) -> Option<&'static (&'static str, &'static str, Fresh)> {
    KINDS.iter().find(|(k, _, _)| *k == name)
}

/// "Fetched 42 min ago", "Fetched just now".
fn fetched_words(age_s: i64) -> String {
    if age_s < 60 {
        "Fetched just now".to_owned()
    } else {
        format!("Fetched {} ago", age_words(age_s))
    }
}

/// `kept_age` by name: a kept answer's age and whether it is past its
/// freshness.
pub fn call(_name: &str, v: &Value) -> R<String> {
    let now = num(Some(v), "now").ok_or("kept_age: \"now\" (Unix seconds) is missing")? as i64;
    let at = num(Some(v), "fetched_at").ok_or("kept_age: \"fetched_at\" (Unix seconds) is missing")? as i64;
    let name = text(Some(v), "kind").ok_or("kept_age: \"kind\" is missing")?;
    let (key, _, fresh) = kind(name).ok_or_else(|| format!("kept_age: no kind called {name:?}"))?;
    let age = (now - at).max(0);
    let (caution, fresh_min, detail, source) = match fresh {
        Fresh::For(s, source) => (
            age >= *s,
            Some(s / 60),
            if age >= *s {
                format!("Older than {}; refresh when there is a signal", age_words(*s))
            } else {
                format!("Fresh for {}", age_words(*s))
            },
            *source,
        ),
        Fresh::Cycle => {
            // Fetched before the cycle in force today began: of the last one.
            let today = now.div_euclid(86_400);
            let started = cycles::start_on(Kind::Airac, today);
            let old = at.div_euclid(86_400) < started;
            let ident = cycles::airac_ident(started);
            let detail = if old { format!("From before FAA data cycle {ident}") } else { format!("Of FAA data cycle {ident}") };
            (old, None, detail, CYCLE_SOURCE)
        }
    };
    let mut out = String::from("{\"kind\":");
    json::string(&mut out, key);
    out.push_str(&format!(",\"age_min\":{}", age / 60));
    out.push_str(",\"line\":");
    json::string(&mut out, &fetched_words(age));
    out.push_str(",\"finding\":");
    json::string(&mut out, if caution { "caution" } else { "ok" });
    out.push_str(",\"fresh_min\":");
    match fresh_min {
        Some(m) => out.push_str(&m.to_string()),
        None => out.push_str("null"),
    }
    out.push_str(",\"detail\":");
    json::string(&mut out, &detail);
    out.push_str(",\"source\":");
    json::string(&mut out, source);
    out.push('}');
    Ok(out)
}

/// The kinds named in a list member, as words, in the order KINDS has them.
fn words_of(kept: Option<&Value>, key: &str) -> Vec<String> {
    let named: Vec<&str> =
        kept.and_then(|k| k.get(key)).and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
    KINDS.iter().filter(|(k, _, _)| named.contains(k)).map(|(_, w, _)| (*w).to_owned()).collect()
}

/// Ready to fly's row for what Keep for the Air holds: every kind the
/// route has on the device, or which are not yet, with the download's
/// size. Their ages are the briefing's and the NOTAMs' own items; this one
/// is whether they are on board at all. None where the app sends nothing.
pub(super) fn kept_item(kept: Option<&Value>) -> Option<Item> {
    let kept = kept?;
    let on_board = words_of(Some(kept), "on_board");
    let missing = words_of(Some(kept), "missing");
    let size = num(Some(kept), "size_mb").map(|mb| format!(", {} MB", mb.round().max(1.0) as i64)).unwrap_or_default();
    const SOURCE: &str = "14 CFR 91.103; the app's choice";
    Some(if missing.is_empty() && !on_board.is_empty() {
        super::item("kept", true, format!("Kept for the air{size}"), format!("{} on this device", sentence(list(&on_board))), SOURCE, None)
    } else {
        let wanted = if missing.is_empty() { "the route's weather, NOTAMs and plates".to_owned() } else { list(&missing) };
        super::item(
            "kept",
            false,
            format!("Keep {wanted} for the air{size}"),
            "Shown with their age when there is no signal".into(),
            SOURCE,
            Some("keep_for_air"),
        )
    })
}

/// The words with their first letter a capital: "Briefing, NOTAMs ...".
fn sentence(mut words: String) -> String {
    if let Some(first) = words.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    words
}
