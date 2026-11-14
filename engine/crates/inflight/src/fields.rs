//! The copilot's alternative: the first field of the emergency assistant's
//! ranking (brief's `best_fields` in its "diversion" mode: the runway
//! against the airplane, the field's flight category, then the time to
//! it) that the copilot's own checks also find good. One ranking for both,
//! so the two never name different "best" fields for the same sky; what
//! the copilot adds is what a diversion with the engine running must also
//! meet:
//!
//! - its weather (`weather_of`): under VFR at or above 91.155(c) and (d)'s
//!   surface-area minimums (1,000 ft and 3 sm, flight::vfr's one copy)
//!   and, VFR or IFR, the pilot's own minimums (the Brief's
//!   gonogo::minimums::under_minimums, the same sentences);
//! - the fuel on board reaches it with the reserve left (14 CFR 91.151(a),
//!   30 minutes by day and 45 at night, judged at the field at the time
//!   of arrival; 91.167(a)(3)'s 45 under IFR: flight::reserve_min);
//! - fuel sold there, where fuel is what is wanted.
//!
//! Weather with no report is not called good: no figure, no promise.

use crate::input::{self, Field, Own, R};
use wingtip_brief::airport_use::Use;
use wingtip_brief::fields::{best_fields, Airplane, Field as Candidate, Mode, Own as From, Ranked};
use wingtip_brief::gonogo::minimums::{under_minimums, Landing, Minimums, Report, Weather as Briefed};
use wingtip_core::geo;
use wingtip_core::json::Value;
use wingtip_flight::{flight, sun, vfr};
use wingtip_procedures::figures::debrief::AIRBORNE_KT;
use wingtip_procedures::figures::words::{alt_ft, js_num};

/// Within this either side of the track a field is "ahead", past 90
/// behind: words for the pilot, not a rule.
const AHEAD_DEG: f64 = 15.0;
const BEHIND_DEG: f64 = 90.0;

/// A field's weather as the copilot reads it.
#[derive(Clone, Debug, PartialEq)]
pub enum Weather {
    Good,
    Under(Vec<String>),
    Unknown,
}

/// Where a field's report is under what the flight needs: 91.155(c), (d)
/// under VFR, and the pilot's minimums either way.
pub fn weather_of(f: &Field, ifr: bool, m: &Minimums) -> Weather {
    let Some(metar) = &f.metar else { return Weather::Unknown };
    let mut why = Vec::new();
    let ceiling = metar.ceiling_ft();
    if !ifr {
        if let Some(c) = ceiling.filter(|c| *c < vfr::SURFACE_AREA_CEILING_FT) {
            why.push(format!(
                "{} ceiling {} ft, under VFR's {} ft (14 CFR 91.155(c))",
                f.ident,
                alt_ft(Some(c)),
                alt_ft(Some(vfr::SURFACE_AREA_CEILING_FT))
            ));
        }
        if let Some(v) = metar.visibility_sm.filter(|v| *v < vfr::SURFACE_AREA_VISIBILITY_SM) {
            why.push(format!(
                "{} visibility {} sm, under VFR's {} sm (14 CFR 91.155(d))",
                f.ident,
                js_num(v),
                js_num(vfr::SURFACE_AREA_VISIBILITY_SM)
            ));
        }
    }
    let report = Report {
        ceiling_ft: ceiling,
        visibility_sm: metar.visibility_sm,
        wind_speed_kt: metar.wind.map(|w| w.speed_kt),
        wind_gust_kt: metar.wind.and_then(|w| w.gust_kt),
    };
    let briefed = Briefed {
        landings: vec![Landing { ident: f.ident.clone(), metar: Some(report), runways: Vec::new() }],
        dest: f.ident.clone(),
        ..Briefed::default()
    };
    why.extend(under_minimums(m, &briefed));
    if !why.is_empty() {
        Weather::Under(why)
    } else if metar.ceiling_unknown() && !ifr {
        Weather::Unknown
    } else {
        Weather::Good
    }
}

/// What the copilot weighs a field with.
#[derive(Clone, Copy)]
pub struct Ask {
    pub own: Own,
    pub ifr: bool,
    pub minimums: Minimums,
    pub fuel_gal: Option<f64>,
    pub burn_gph: Option<f64>,
    /// The airplane's cruise, for the minutes when the ground speed is
    /// under flying speed (a dry run not started, a GPS on the ramp).
    pub tas_kt: Option<f64>,
    pub now_s: Option<f64>,
}

pub fn ask(name: &str, v: &Value) -> R<Ask> {
    Ok(Ask {
        own: input::own(name, v)?,
        ifr: input::ifr(name, v)?,
        minimums: input::minimums(name, v)?,
        fuel_gal: input::num(name, v, "fuel_gal")?,
        burn_gph: input::num(name, v, "burn_gph")?.filter(|b| *b > 0.0),
        tas_kt: input::num(name, v, "tas_kt")?,
        now_s: input::num(name, v, "now_s")?,
    })
}

/// The ground speed minutes are worked at: own ship's once flying, else
/// the airplane's cruise.
pub fn speed_kt(own: &Own, tas_kt: Option<f64>) -> Option<f64> {
    if own.gs_kt >= AIRBORNE_KT {
        Some(own.gs_kt)
    } else {
        tas_kt.filter(|t| *t > 0.0)
    }
}

/// The reserve at a place and time: 91.151(a)'s by day or night there,
/// 91.167(a)(3)'s under IFR. With no time known it is taken as night,
/// the larger.
pub fn reserve_at(ifr: bool, lat: f64, lon: f64, at_s: Option<f64>) -> f64 {
    flight::reserve_min(ifr, at_s.is_none_or(|t| sun::is_night(lat, lon, t)))
}

/// Fuel left on landing, minutes at the burn, after `hours` more flying.
pub fn fuel_left_min(fuel_gal: Option<f64>, burn_gph: Option<f64>, hours: Option<f64>) -> Option<f64> {
    let (fuel, burn, hours) = (fuel_gal?, burn_gph?, hours?);
    Some((fuel - burn * hours) / burn * 60.0)
}

/// The field picked, with the figures the copilot says of it.
#[derive(Clone, Debug, PartialEq)]
pub struct Pick {
    pub field: Field,
    pub ranked: Ranked,
    pub off_track_deg: Option<f64>,
    pub minutes: Option<f64>,
    pub fuel_at_landing_min: Option<f64>,
    pub reserve_min: f64,
}

impl Pick {
    /// "ahead", "left", "right" or "behind", from the track.
    pub fn side(&self) -> Option<&'static str> {
        let off = self.off_track_deg?;
        Some(if off.abs() <= AHEAD_DEG {
            "ahead"
        } else if off.abs() > BEHIND_DEG {
            "behind"
        } else if off < 0.0 {
            "left"
        } else {
            "right"
        })
    }

    pub fn distance_nm(&self) -> f64 {
        self.ranked.distance_nm
    }

    /// Who may land there, said after the field where it is not public
    /// use: with the engine running there is no emergency (14 CFR 91.3(b)
    /// is for one), so the owner's or the service's permission stands.
    /// best_fields ranks such a field after a public one otherwise alike;
    /// where it is still the pick, the pilot hears why it may not do.
    pub fn permission(&self) -> Option<&'static str> {
        match self.ranked.field.usage {
            Use::Private => Some("private: permission needed"),
            Use::Military => Some("military: prior permission"),
            Use::Public | Use::Joint => None,
        }
    }

    /// The runway best_fields picked, "Runway 18: 5,941 ft", where it did.
    pub fn runway_words(&self) -> Option<String> {
        self.ranked.end.as_ref()?;
        self.ranked.reasons.iter().find(|(_, r)| r.starts_with("Runway ")).map(|(_, r)| r.clone())
    }
}

/// The first field of best_fields' diversion ranking, not one of
/// `exclude`, that the copilot's checks find good (and that sells fuel,
/// where `need_fuel`); None where none does.
pub fn alternative(a: &Ask, fields: &[Field], candidates: &[Candidate], need_fuel: bool, exclude: &[&str]) -> Option<Pick> {
    let o = &a.own;
    let from = From { lat: o.lat, lon: o.lon, altitude_ft: None, speed_kt: Some(o.gs_kt), wind: None, variation_deg: None };
    let airplane = Airplane { cruise_tas_kt: speed_kt(o, a.tas_kt), ..Airplane::default() };
    let answer = best_fields(Mode::Diversion, &from, Some(&airplane), candidates.to_vec(), candidates.len());
    answer.fields.into_iter().find_map(|ranked| {
        if exclude.iter().any(|e| input::same_field(e, &ranked.field.ident)) {
            return None;
        }
        let field = fields.iter().find(|f| input::same_field(&f.ident, &ranked.field.ident))?.clone();
        if (need_fuel && !field.fuel) || weather_of(&field, a.ifr, &a.minimums) != Weather::Good {
            return None;
        }
        let minutes = speed_kt(o, a.tas_kt).map(|kt| ranked.distance_nm / kt * 60.0);
        let fuel_at_landing_min = fuel_left_min(a.fuel_gal, a.burn_gph, minutes.map(|m| m / 60.0));
        let reserve_min = reserve_at(a.ifr, field.lat, field.lon, a.now_s.map(|t| t + minutes.unwrap_or(0.0) * 60.0));
        if fuel_at_landing_min.is_some_and(|left| left < reserve_min) {
            return None;
        }
        let off_track_deg = o.track_deg.map(|t| geo::py_mod(ranked.course_deg - t + 180.0, 360.0) - 180.0);
        Some(Pick { field, ranked, off_track_deg, minutes, fuel_at_landing_min, reserve_min })
    })
}

fn opt(n: Option<f64>) -> Value {
    n.map_or(Value::Null, Value::Number)
}

/// The alternative as the answer gives it.
pub fn to_value(p: &Pick) -> Value {
    let f = &p.field;
    let s = |t: &str| Value::String(t.to_owned());
    Value::Object(vec![
        ("ident".into(), s(&f.ident)),
        ("name".into(), f.name.as_deref().map_or(Value::Null, s)),
        ("lat".into(), Value::Number(f.lat)),
        ("lon".into(), Value::Number(f.lon)),
        ("distance_nm".into(), Value::Number((p.distance_nm() * 10.0).round() / 10.0)),
        ("course_deg".into(), Value::Number(p.ranked.course_deg.round() % 360.0)),
        ("side".into(), p.side().map_or(Value::Null, s)),
        ("minutes".into(), opt(p.minutes.map(f64::round))),
        ("category".into(), f.category().map_or(Value::Null, s)),
        ("runway".into(), p.runway_words().map_or(Value::Null, |r| s(&r))),
        ("fuel".into(), Value::Bool(f.fuel)),
        ("fuel_at_landing_min".into(), opt(p.fuel_at_landing_min.map(f64::round))),
        ("reserve_min".into(), Value::Number(p.reserve_min)),
        ("private".into(), Value::Bool(p.ranked.field.usage.private())),
        ("military".into(), p.ranked.field.usage.military().map_or(Value::Null, s)),
        ("reasons".into(), Value::Array(p.ranked.reasons.iter().map(|(_, r)| s(r)).collect())),
    ])
}
