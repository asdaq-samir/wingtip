//! How near a thing on the paperwork list falls due, as every app colours
//! its row (GET /api/paperwork, the gateway's PaperworkService): past is a
//! stop, within the reminders' window a caution, further off fine. The
//! days and hours themselves are the engine's (pilot_currency,
//! inspections_due) or the owner's own; this is only their tone, said
//! once here rather than in each app.

use crate::json::{self, Value};

/// Within this many days an item is coming up: the reminders' first email
/// (the gateway's ReminderService writes 30 and 7 days before), not a
/// regulation's window.
pub const SOON_DAYS: f64 = 30.0;
/// Within this many hours of time in service an hour-counted item (a
/// 100-hour inspection, 14 CFR 91.409(b)) is coming up: about a
/// fortnight's flying for an airplane flown for hire. A design choice.
pub const SOON_HOURS: f64 = 10.0;

/// "stop", "caution", "ok", or "unknown" where it has neither: by its day
/// where it has one, else by its hours. A day left of 0 is today, still in
/// time; an hour-counted item with none left is due now.
pub fn due_tone(days_left: Option<f64>, hours_left: Option<f64>) -> &'static str {
    match (days_left, hours_left) {
        (Some(d), _) if d < 0.0 => "stop",
        (Some(d), _) if d <= SOON_DAYS => "caution",
        (Some(_), _) => "ok",
        (None, Some(h)) if h <= 0.0 => "stop",
        (None, Some(h)) if h <= SOON_HOURS => "caution",
        (None, Some(_)) => "ok",
        (None, None) => "unknown",
    }
}

fn opt(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

/// `due_tone` from `{"days_left"?, "hours_left"?}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    json::string(&mut out, due_tone(opt(name, v, "days_left")?, opt(name, v, "hours_left")?));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn past_is_a_stop_the_reminders_window_a_caution() {
        assert_eq!(due_tone(Some(-1.0), None), "stop");
        assert_eq!(due_tone(Some(0.0), None), "caution");
        assert_eq!(due_tone(Some(30.0), None), "caution");
        assert_eq!(due_tone(Some(31.0), None), "ok");
        // The day decides where there is one.
        assert_eq!(due_tone(Some(40.0), Some(-5.0)), "ok");
        assert_eq!(due_tone(None, Some(0.0)), "stop");
        assert_eq!(due_tone(None, Some(10.0)), "caution");
        assert_eq!(due_tone(None, Some(10.5)), "ok");
        assert_eq!(due_tone(None, None), "unknown");
    }
}
