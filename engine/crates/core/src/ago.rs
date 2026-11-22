//! How long ago something was, in the few words every app writes it in:
//! a report's "Observed 40m ago", a kept answer's "Fetched 3h ago", an
//! airplane's last track "2d ago". It was four rules on the iPhone, two on
//! Android, one on the web and one in the engine's kept lines, each with
//! its own steps ("14 min ago", "2 h ago", "2h 5m ago"); now one, asked
//! by name (`time_ago`). No aviation rule: the app's own wording, the
//! web's narrow duration ("2h 5m", Intl.DurationFormat's narrow style,
//! the owner's 2026-10-28 pick), whole units counted down, never up.

use crate::ask::Ask;
use crate::json::{self, Value};

/// The words for `seconds` gone: "just now" under a minute, "23m ago"
/// under an hour, "2h 5m ago" ("2h ago" on the hour) under two days, then
/// whole days, "3d ago". A time to come (negative) is "just now", as a
/// clock a little ahead of the feed's is.
pub fn words(seconds: f64) -> String {
    let minutes = if seconds.is_finite() { (seconds.max(0.0) / 60.0).floor() as i64 } else { 0 };
    if minutes < 1 {
        return "just now".into();
    }
    if minutes < 60 {
        return format!("{minutes}m ago");
    }
    if minutes < 48 * 60 {
        let (h, m) = (minutes / 60, minutes % 60);
        return if m == 0 { format!("{h}h ago") } else { format!("{h}h {m}m ago") };
    }
    format!("{}d ago", minutes / (24 * 60))
}

/// `time_ago`: {"seconds": n} to its words, a JSON string.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let seconds = Ask::new(name, v).num("seconds")?;
    let mut out = String::new();
    json::string(&mut out, &words(seconds));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::words;

    #[test]
    fn counts_down_in_whole_units() {
        for (s, w) in [
            (-30.0, "just now"),
            (0.0, "just now"),
            (59.9, "just now"),
            (60.0, "1m ago"),
            (23.0 * 60.0 + 59.0, "23m ago"),
            (3599.0, "59m ago"),
            (3600.0, "1h ago"),
            (3600.0 + 5.0 * 60.0, "1h 5m ago"),
            (47.0 * 3600.0 + 59.0 * 60.0, "47h 59m ago"),
            (48.0 * 3600.0, "2d ago"),
            (5.0 * 86_400.0 + 3600.0, "5d ago"),
            (f64::NAN, "just now"),
        ] {
            assert_eq!(words(s), w, "{s} s");
        }
    }
}
