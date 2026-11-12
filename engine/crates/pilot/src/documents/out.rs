//! The flags a figure goes back with, and the small JSON writer the two
//! answers are written with (the engine's own JSON, crate::json).

use crate::json;

/// How sure a flag is: "check" where a figure is outside what light
/// airplanes' handbooks give or disagrees with another, "wrong" where it
/// cannot be right as read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Check,
    Wrong,
}

impl Level {
    fn word(self) -> &'static str {
        match self {
            Level::Check => "check",
            Level::Wrong => "wrong",
        }
    }
}

/// What to check about a figure, in a sentence the pilot reads, and the
/// figure it is about where it is one (a logbook entry's member).
#[derive(Clone, Debug, PartialEq)]
pub struct Flag {
    pub level: Level,
    pub field: Option<&'static str>,
    pub says: String,
}

pub fn check(says: String) -> Flag {
    Flag { level: Level::Check, field: None, says }
}

pub fn wrong(says: String) -> Flag {
    Flag { level: Level::Wrong, field: None, says }
}

/// A number as the app writes it: whole where it is, else to a tenth.
pub fn figure(v: f64) -> String {
    let r = (v * 10.0).round() / 10.0;
    let whole = r.fract() == 0.0;
    let text = if whole { format!("{}", r as i64) } else { format!("{r:.1}") };
    // Thousands separated, as the app writes altitudes and weights.
    let (int, frac) = text.split_once('.').map_or((text.as_str(), None), |(i, f)| (i, Some(f)));
    let grouped = crate::text::grouped(int);
    match frac {
        Some(f) => format!("{grouped}.{f}"),
        None => grouped,
    }
}

/// An object written member by member.
pub struct Obj(String);

impl Obj {
    pub fn new() -> Obj {
        Obj(String::from("{"))
    }

    fn key(&mut self, k: &str) {
        if !self.0.ends_with('{') {
            self.0.push(',');
        }
        json::string(&mut self.0, k);
        self.0.push(':');
    }

    pub fn num(&mut self, k: &str, v: f64) -> &mut Obj {
        self.key(k);
        json::number(&mut self.0, v);
        self
    }

    pub fn opt(&mut self, k: &str, v: Option<f64>) -> &mut Obj {
        self.key(k);
        json::opt_number(&mut self.0, v);
        self
    }

    pub fn text(&mut self, k: &str, v: Option<&str>) -> &mut Obj {
        self.key(k);
        json::opt_string(&mut self.0, v);
        self
    }

    pub fn flag(&mut self, k: &str, v: bool) -> &mut Obj {
        self.key(k);
        self.0.push_str(if v { "true" } else { "false" });
        self
    }

    /// A member already written as JSON.
    pub fn raw(&mut self, k: &str, v: &str) -> &mut Obj {
        self.key(k);
        self.0.push_str(v);
        self
    }

    pub fn done(&mut self) -> String {
        let mut s = std::mem::take(&mut self.0);
        s.push('}');
        s
    }
}

pub fn array(items: impl IntoIterator<Item = String>) -> String {
    format!("[{}]", items.into_iter().collect::<Vec<_>>().join(","))
}

pub fn flags_json(flags: &[Flag]) -> String {
    array(flags.iter().map(|f| Obj::new().text("level", Some(f.level.word())).text("field", f.field).text("says", Some(&f.says)).done()))
}
