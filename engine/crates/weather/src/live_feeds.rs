//! How often the apps ask the planner again for what the FAA's SWIM feeds
//! say now (the planner's /api/live/*, which ingest keeps): how long an
//! answer counts as fresh, and how often a screen showing it asks again.
//! What a report means for the flight is the engine's elsewhere (rvr_check,
//! read_datis, the Go / No-Go's findings); this is only its cadence, said
//! once here rather than in each app (#482).
//!
//! A runway's RVR is "updated approximately once every minute for
//! controller issuance to pilots" (AIM 7-1-13), so a minute is as fresh as
//! the feed can be; the ITWS alerts and SFDPS's special activity airspace
//! status are asked as often, the app's choice at RVR's minute. The Command
//! Center's programs, the D-ATIS and a flight's tower departure events
//! change in minutes, not seconds: five minutes each, the app's choice,
//! and the D-ATIS and the departures are not polled at all, only asked
//! again once stale when a screen shows them.

use crate::json::{self, Value};

/// Each feed by its name in the contract: how long an answer is fresh and
/// how often a screen showing it asks again (None: not polled), seconds,
/// and where the figure comes from.
const FEEDS: [(&str, i64, Option<i64>, &str); 6] = [
    ("rvr", 60, Some(60), "AIM 7-1-13: RVR updated about once a minute"),
    ("itws", 60, Some(60), "The app's choice, at RVR's minute (AIM 7-1-13)"),
    ("saa", 60, Some(60), "The app's choice, at RVR's minute (AIM 7-1-13)"),
    ("flow", 300, Some(300), "The app's choice"),
    ("atis", 300, None, "The app's choice"),
    ("departures", 300, None, "The app's choice"),
];

/// `live_feed_refresh` by name, from `{"feed"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let feed = v.get("feed").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"feed\" is missing"))?;
    let (_, fresh, poll, source) = FEEDS.iter().find(|f| f.0 == feed).ok_or_else(|| format!("{name}: no feed called {feed:?}"))?;
    let mut out = String::from("{\"fresh_s\":");
    json::number(&mut out, *fresh as f64);
    out.push_str(",\"poll_s\":");
    json::opt_number(&mut out, poll.map(|p| p as f64));
    out.push_str(",\"source\":");
    json::string(&mut out, source);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(feed: &str) -> Result<String, String> {
        call("live_feed_refresh", &json::parse(&format!("{{\"feed\":\"{feed}\"}}")).unwrap())
    }

    #[test]
    fn rvr_is_asked_each_minute_as_it_is_updated() {
        assert!(ask("rvr").unwrap().starts_with("{\"fresh_s\":60.0,\"poll_s\":60.0,"));
    }

    #[test]
    fn the_atis_is_not_polled() {
        assert!(ask("atis").unwrap().starts_with("{\"fresh_s\":300.0,\"poll_s\":null,"));
    }

    #[test]
    fn a_feed_it_does_not_know_is_refused() {
        assert!(ask("metar").is_err());
    }
}
