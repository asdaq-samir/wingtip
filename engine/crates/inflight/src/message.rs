//! A copilot message: what the banner says in a line, what is spoken, the
//! detail folded under a tap, and where each figure comes from. Ranked
//! by its level, then by how soon its kind changes what the pilot does
//! (KINDS), so the host shows the first and only the first.

use wingtip_core::json::Value;
use wingtip_core::sort::StableSort;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    /// Act now: the ground ahead, a microburst on the runway, fuel under
    /// the reserve.
    Warning,
    /// Decide soon: the weather, an area going active, the night.
    Caution,
    /// Worth knowing: a slower flight than planned.
    Advisory,
}

impl Level {
    pub fn word(self) -> &'static str {
        match self {
            Level::Warning => "warning",
            Level::Caution => "caution",
            Level::Advisory => "advisory",
        }
    }
}

/// The kinds, in the order they are ranked within a level: the ground
/// and airspace about to be met first (seconds), then the runway's wind,
/// the fuel, a destination NASR lists as closed, the field's weather, the
/// areas further ahead, the night, the ground speed. A design choice,
/// written down here once.
pub const KINDS: [&str; 10] = ["ahead", "itws", "fuel", "closed", "weather", "tfr", "convective", "sua", "night", "groundspeed"];

#[derive(Clone, Debug, PartialEq)]
pub struct Message {
    /// Stays the same while the thing it says does, so a host speaks a
    /// message once and again only when it changes.
    pub id: String,
    pub kind: &'static str,
    pub level: Level,
    pub title: String,
    pub say: String,
    pub detail: Vec<String>,
    pub sources: Vec<String>,
    /// Shown by another banner already (the alerts ahead): ranked here so
    /// nothing else covers it, drawn there.
    pub elsewhere: bool,
    pub alternative: Option<Value>,
}

impl Message {
    pub fn new(id: String, kind: &'static str, level: Level, title: String, say: String) -> Message {
        Message { id, kind, level, title, say, detail: Vec::new(), sources: Vec::new(), elsewhere: false, alternative: None }
    }

    fn order(&self) -> (Level, usize) {
        (self.level, KINDS.iter().position(|k| *k == self.kind).unwrap_or(KINDS.len()))
    }

    pub fn to_value(&self) -> Value {
        let s = |t: &str| Value::String(t.to_owned());
        let strings = |items: &[String]| Value::Array(items.iter().map(|i| s(i)).collect());
        Value::Object(vec![
            ("id".into(), s(&self.id)),
            ("kind".into(), s(self.kind)),
            ("level".into(), s(self.level.word())),
            ("title".into(), s(&self.title)),
            ("say".into(), s(&self.say)),
            ("detail".into(), strings(&self.detail)),
            ("sources".into(), strings(&self.sources)),
            ("elsewhere".into(), Value::Bool(self.elsewhere)),
            ("alternative".into(), self.alternative.clone().unwrap_or(Value::Null)),
        ])
    }
}

/// The messages most pressing first; equals keep the order found.
pub fn rank(messages: &mut [Message]) {
    messages.stable_sort_by_key(Message::order);
}

/// A UNIX time as a pilot reads it, "1742Z".
pub fn zulu(at_s: f64) -> String {
    let day = at_s.rem_euclid(86_400.0);
    let minutes = (day / 60.0).round() as i64 % 1440;
    format!("{:02}{:02}Z", minutes / 60, minutes % 60)
}

/// "9 min", "1 h 05 min".
pub fn minutes_words(min: f64) -> String {
    let m = min.max(0.0).round() as i64;
    if m < 60 {
        format!("{m} min")
    } else {
        format!("{} h {:02} min", m / 60, m % 60)
    }
}
