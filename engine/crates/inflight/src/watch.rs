//! The in-flight copilot (`copilot_watch`): from where the airplane is and
//! what the live data says now, the messages that change what the pilot
//! should do, most pressing first. The host shows the first and speaks a
//! message once, by its id. Every decision is here and every threshold is
//! another rule's (fields.rs, checks.rs); the copilot only warns, it never
//! stops anything (the owner's rule).
//!
//! Its input, snake_case (engine.schema.json has it exactly):
//! `{"now_s", "own": {"lat", "lon", "track_deg"?, "gs_kt"?}, "rules"?:
//! "VFR"|"IFR", "dest", "alternate"?, "remaining_nm"?, "planned_gs_kt"?,
//! "tas_kt"?, "fuel_gal"?, "burn_gph"?, "minimums"?, "passengers"?,
//! "night_current"?, "fields": [...], "areas": [...], "itws": [...],
//! "ahead": [...]}`: the fields best_fields' candidates (brief's fields)
//! with `fuel` and `planned_category`, the fields and areas as the
//! planner's /api/copilot/around gives them.

use crate::checks;
use crate::fields::{self, Ask};
use crate::input::{self, Field, R};
use crate::message::{self, Message};
use wingtip_brief::fields::calls::fields_of;
use wingtip_brief::fields::Field as Candidate;
use wingtip_core::geo;
use wingtip_core::json::Value;

/// An area on or near the route ahead, the planner's: a TFR, a
/// special-use area with SFDPS's word on it, or a convective SIGMET,
/// at a point it gives (where the route meets it, else within it).
#[derive(Clone, Debug, PartialEq)]
pub struct Area {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub active: Option<bool>,
    pub starts_s: Option<f64>,
    pub until_s: Option<f64>,
}

/// An ITWS alert at an airport (wingtip.itws, AIM 4-3-7).
#[derive(Clone, Debug, PartialEq)]
pub struct Itws {
    pub airport: String,
    pub alert: String,
    pub words: String,
}

/// An alert ahead as /api/airspace/ahead (or the phone's packs) gave it.
#[derive(Clone, Debug, PartialEq)]
pub struct Ahead {
    pub id: String,
    pub kind: String,
    pub level: String,
    pub name: String,
}

/// The flight as the checks read it.
pub struct Flight {
    pub now_s: f64,
    pub ask: Ask,
    pub dest: Field,
    pub alternate: Option<Field>,
    pub fields: Vec<Field>,
    /// The same fields as best_fields reads them, for its ranking.
    pub candidates: Vec<Candidate>,
    pub remaining_nm: f64,
    /// The minutes to the destination at the ground speed, None when
    /// neither it nor the cruise is known.
    pub minutes: Option<f64>,
    pub planned_gs_kt: Option<f64>,
    pub passengers: bool,
    pub night_current: Option<bool>,
    pub areas: Vec<Area>,
    pub itws: Vec<Itws>,
    pub ahead: Vec<Ahead>,
}

fn find(fields: &[Field], ident: &str) -> Option<Field> {
    fields.iter().find(|f| input::same_field(&f.ident, ident)).cloned()
}

fn str_of(name: &str, v: &Value, key: &str) -> R<String> {
    Ok(input::text(name, v, key)?.unwrap_or("").to_owned())
}

pub fn flight(name: &str, v: &Value) -> R<Flight> {
    let ask = fields::ask(name, v)?;
    let fields = input::fields(name, v)?;
    let candidates = fields_of(name, v)?;
    let dest_id = input::text(name, v, "dest")?.ok_or_else(|| format!("{name}: \"dest\" is missing"))?;
    // A destination not among the fields (the planner leaves a closed one
    // out of its lists, decision 0043, unless it sends it with its status)
    // is still watched for: where it is not known, so neither its weather
    // nor its distance, and `remaining_nm` the host's. Never an error: the
    // copilot keeps watching the rest of the flight.
    let dest = find(&fields, dest_id).unwrap_or_else(|| Field {
        ident: dest_id.to_owned(),
        name: None,
        lat: ask.own.lat,
        lon: ask.own.lon,
        metar: None,
        raw: None,
        planned_category: None,
        fuel: false,
        status: None,
    });
    let alternate = input::text(name, v, "alternate")?.and_then(|a| find(&fields, a));
    let o = &ask.own;
    let remaining_nm = input::num(name, v, "remaining_nm")?.unwrap_or_else(|| geo::distance_nm(o.lat, o.lon, dest.lat, dest.lon));
    let minutes = fields::speed_kt(o, ask.tas_kt).map(|kt| remaining_nm / kt * 60.0);
    let areas = input::list(name, v, "areas")?
        .iter()
        .map(|a| {
            Ok(Area {
                kind: str_of(name, a, "kind")?,
                id: str_of(name, a, "id")?,
                name: str_of(name, a, "name")?,
                lat: input::need(name, a, "lat")?,
                lon: input::need(name, a, "lon")?,
                active: input::flag(name, a, "active")?,
                starts_s: input::num(name, a, "starts_s")?,
                until_s: input::num(name, a, "until_s")?,
            })
        })
        .collect::<R<_>>()?;
    let itws = input::list(name, v, "itws")?
        .iter()
        .map(|i| Ok(Itws { airport: str_of(name, i, "airport")?, alert: str_of(name, i, "alert")?, words: str_of(name, i, "words")? }))
        .collect::<R<_>>()?;
    let ahead = input::list(name, v, "ahead")?
        .iter()
        .map(|a| {
            Ok(Ahead {
                id: str_of(name, a, "id")?,
                kind: str_of(name, a, "kind")?,
                level: str_of(name, a, "level")?,
                name: str_of(name, a, "name")?,
            })
        })
        .collect::<R<_>>()?;
    Ok(Flight {
        now_s: input::need(name, v, "now_s")?,
        planned_gs_kt: input::num(name, v, "planned_gs_kt")?,
        passengers: input::flag(name, v, "passengers")?.unwrap_or(false),
        night_current: input::flag(name, v, "night_current")?,
        ask,
        dest,
        alternate,
        fields,
        candidates,
        remaining_nm,
        minutes,
        areas,
        itws,
        ahead,
    })
}

/// `copilot_watch`: `{"messages": [...], "eta_s", "remaining_nm",
/// "fuel_at_landing_min", "reserve_min"}`, the messages ranked.
pub fn rule(name: &str, v: &Value) -> R<Value> {
    let f = flight(name, v)?;
    let mut messages: Vec<Message> = Vec::new();
    messages.extend(checks::ahead(&f));
    messages.extend(checks::itws(&f));
    messages.extend(checks::fuel(&f));
    messages.extend(checks::closed(&f));
    messages.extend(checks::weather(&f));
    messages.extend(checks::areas(&f));
    messages.extend(checks::night(&f));
    messages.extend(checks::groundspeed(&f));
    message::rank(&mut messages);
    let landing = checks::landing(&f);
    let opt = |n: Option<f64>| n.map_or(Value::Null, |n| Value::Number(n.round()));
    Ok(Value::Object(vec![
        ("messages".into(), Value::Array(messages.iter().map(Message::to_value).collect())),
        ("eta_s".into(), opt(f.minutes.map(|m| f.now_s + m * 60.0))),
        ("remaining_nm".into(), Value::Number((f.remaining_nm * 10.0).round() / 10.0)),
        ("fuel_at_landing_min".into(), opt(landing.fuel_left_min)),
        ("reserve_min".into(), Value::Number(landing.reserve_min)),
    ]))
}
