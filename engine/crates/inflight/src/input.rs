//! What the in-flight rules read, from the JSON the hosts send: own ship,
//! the fields round it with their reports, and the pilot's minimums. A
//! missing figure stays None; a figure of the wrong kind is an error.

use wingtip_brief::gonogo::minimums::Minimums;
use wingtip_core::json::Value;
use wingtip_weather::metar::{self, Metar};

pub type R<T> = Result<T, String>;

/// Where the airplane is and how it goes: its true track and ground
/// speed (a GPS's, or the dry run's), its altitude where known.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Own {
    pub lat: f64,
    pub lon: f64,
    pub track_deg: Option<f64>,
    pub gs_kt: f64,
}

/// A landing field the airplane might go to, as the planner's
/// /api/copilot/around gives it -- the emergency assistant's best_fields
/// candidate (brief's fields), with whether NASR lists fuel there and the
/// category it had when the flight was planned -- as far as the copilot's
/// own checks read it: the METAR as sent.
#[derive(Clone, Debug, PartialEq)]
pub struct Field {
    pub ident: String,
    pub name: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub metar: Option<Metar>,
    pub raw: Option<String>,
    /// The category the field had when the flight was planned, so a
    /// worse one now is said as a change ("just went IFR").
    pub planned_category: Option<String>,
    pub fuel: bool,
    /// NASR APT_BASE's ARPT_STATUS where the host sent it: a destination
    /// sent closed is said so (checks::closed), and best_fields never
    /// ranks such a field (decision 0043).
    pub status: Option<String>,
}

impl Field {
    /// The flight category its report gives (metar::flight_category_of,
    /// the AWC's bounds), None with no report or none settled.
    pub fn category(&self) -> Option<&'static str> {
        let m = self.metar.as_ref()?;
        metar::flight_category_of(m.ceiling_ft(), m.ceiling_unknown(), m.visibility_sm)
    }

    /// The name a pilot says: the field's own where given, else its ident.
    pub fn said(&self) -> &str {
        self.name.as_deref().filter(|n| !n.is_empty()).unwrap_or(&self.ident)
    }
}

pub fn num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) if n.is_finite() => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

pub fn need(name: &str, v: &Value, key: &str) -> R<f64> {
    num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

pub fn flag(name: &str, v: &Value, key: &str) -> R<Option<bool>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(format!("{name}: \"{key}\" is not true or false")),
    }
}

pub fn text<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<&'a str>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    }
}

pub fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

pub fn own(name: &str, v: &Value) -> R<Own> {
    let o = v.get("own").ok_or_else(|| format!("{name}: \"own\" is missing"))?;
    Ok(Own {
        lat: need(name, o, "lat")?,
        lon: need(name, o, "lon")?,
        track_deg: num(name, o, "track_deg")?,
        gs_kt: num(name, o, "gs_kt")?.unwrap_or(0.0).max(0.0),
    })
}

pub fn fields(name: &str, v: &Value) -> R<Vec<Field>> {
    list(name, v, "fields")?
        .iter()
        .map(|f| {
            // The METAR as best_fields reads it, its report as sent in `raw`.
            let raw = match f.get("metar") {
                None | Some(Value::Null) => None,
                Some(m) => text(name, m, "raw")?.map(str::to_owned),
            };
            Ok(Field {
                ident: text(name, f, "ident")?.ok_or_else(|| format!("{name}: a field has no \"ident\""))?.to_owned(),
                name: text(name, f, "name")?.map(str::to_owned),
                lat: need(name, f, "lat")?,
                lon: need(name, f, "lon")?,
                metar: raw.as_deref().and_then(metar::parse),
                raw,
                planned_category: text(name, f, "planned_category")?.map(str::to_owned),
                fuel: flag(name, f, "fuel")?.unwrap_or(false),
                status: text(name, f, "status")?.map(str::to_owned),
            })
        })
        .collect()
}

/// The pilot's own minimums (the Brief's, gonogo::minimums), each off
/// until set.
pub fn minimums(name: &str, v: &Value) -> R<Minimums> {
    let Some(m) = v.get("minimums").filter(|m| !matches!(m, Value::Null)) else {
        return Ok(Minimums::default());
    };
    Ok(Minimums {
        ceiling_ft: num(name, m, "ceiling_ft")?,
        visibility_sm: num(name, m, "visibility_sm")?,
        crosswind_kt: num(name, m, "crosswind_kt")?,
        wind_kt: num(name, m, "wind_kt")?,
    })
}

/// Whether the flight is IFR: `"rules": "IFR"`; anything else is VFR.
pub fn ifr(name: &str, v: &Value) -> R<bool> {
    Ok(text(name, v, "rules")?.is_some_and(|r| r.eq_ignore_ascii_case("IFR")))
}

/// The same airport by its ICAO or FAA ident: "KOSH" is "OSH".
pub fn same_field(a: &str, b: &str) -> bool {
    let bare = |s: &str| {
        let s = s.trim().to_ascii_uppercase();
        if s.len() == 4 && s.starts_with('K') {
            s[1..].to_owned()
        } else {
            s
        }
    };
    bare(a) == bare(b)
}
