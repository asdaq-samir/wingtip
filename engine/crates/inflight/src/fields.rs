//! The best fields to go to from where the airplane is (`best_fields`):
//! the in-flight copilot's alternative when the destination's weather or
//! the fuel turns, and the emergency assistant's fields within glide
//! (claude/emergency-assist, which asks with `within_nm`). One ranking for
//! both, so the two never name different "best" fields for the same sky.
//!
//! A field is good when, as far as is known now,
//! - its weather is (`weather_of`): under VFR at or above 91.155(c) and
//!   (d)'s surface-area minimums (1,000 ft and 3 sm, flight::vfr's one
//!   copy) and, VFR or IFR, the pilot's own minimums (the Brief's
//!   gonogo::minimums::under_minimums, the same sentences);
//! - the fuel on board reaches it with the reserve left (14 CFR 91.151(a),
//!   30 minutes by day and 45 at night, judged at the field at the time
//!   of arrival; 91.167(a)(3)'s 45 under IFR: flight::reserve_min);
//! - its longest paved runway is at least the airplane's, where one is
//!   asked; and fuel is sold there, where fuel is what is wanted.
//!
//! Good fields come first, the nearest in time first; then the rest, the
//! ones with a report before those with none. Nothing is refused: a field
//! not good is still listed with why (the owner's rule, warn never limit).
//! Weather with no report is not called good: no figure, no promise.

use crate::input::{self, Field, Own, R};
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
            why.push(format!("{} ceiling {} ft, under VFR's {} ft (14 CFR 91.155(c))", f.ident, alt_ft(Some(c)), alt_ft(Some(vfr::SURFACE_AREA_CEILING_FT))));
        }
        if let Some(v) = metar.visibility_sm.filter(|v| *v < vfr::SURFACE_AREA_VISIBILITY_SM) {
            why.push(format!("{} visibility {} sm, under VFR's {} sm (14 CFR 91.155(d))", f.ident, js_num(v), js_num(vfr::SURFACE_AREA_VISIBILITY_SM)));
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
    if why.is_empty() {
        if metar.ceiling_unknown() && !ifr {
            return Weather::Unknown;
        }
        Weather::Good
    } else {
        Weather::Under(why)
    }
}

/// What a ranking is asked with.
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
    pub runway_min_ft: Option<f64>,
    pub within_nm: Option<f64>,
    pub need_fuel: bool,
    pub exclude: Vec<String>,
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
        runway_min_ft: input::num(name, v, "runway_min_ft")?,
        within_nm: input::num(name, v, "within_nm")?,
        need_fuel: input::flag(name, v, "need_fuel")?.unwrap_or(false),
        exclude: input::list(name, v, "exclude")?.iter().filter_map(Value::as_str).map(str::to_owned).collect(),
    })
}

/// The ground speed minutes are worked at: own ship's once flying, else
/// the airplane's cruise.
pub fn speed_kt(own: &Own, tas_kt: Option<f64>) -> Option<f64> {
    if own.gs_kt >= AIRBORNE_KT { Some(own.gs_kt) } else { tas_kt.filter(|t| *t > 0.0) }
}

/// The reserve at a place and time: 91.151(a)'s by day or night there,
/// 91.167(a)(3)'s under IFR. With no time known it is taken as night,
/// the larger.
pub fn reserve_at(ifr: bool, lat: f64, lon: f64, at_s: Option<f64>) -> f64 {
    flight::reserve_min(ifr, at_s.map_or(true, |t| sun::is_night(lat, lon, t)))
}

/// One field as ranked.
#[derive(Clone, Debug, PartialEq)]
pub struct Pick {
    pub field: Field,
    pub distance_nm: f64,
    pub bearing_deg: f64,
    pub off_track_deg: Option<f64>,
    pub minutes: Option<f64>,
    pub weather: Weather,
    pub fuel_at_landing_min: Option<f64>,
    pub reserve_min: f64,
    pub ok: bool,
    pub why: Vec<String>,
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
}

/// Fuel left on landing, minutes at the burn, after `hours` more flying.
pub fn fuel_left_min(fuel_gal: Option<f64>, burn_gph: Option<f64>, hours: Option<f64>) -> Option<f64> {
    let (fuel, burn, hours) = (fuel_gal?, burn_gph?, hours?);
    Some((fuel - burn * hours) / burn * 60.0)
}

fn pick(a: &Ask, f: &Field) -> Pick {
    let o = &a.own;
    let distance_nm = geo::distance_nm(o.lat, o.lon, f.lat, f.lon);
    let bearing_deg = geo::bearing_deg(o.lat, o.lon, f.lat, f.lon);
    let off_track_deg = o.track_deg.map(|t| geo::py_mod(bearing_deg - t + 180.0, 360.0) - 180.0);
    let minutes = speed_kt(o, a.tas_kt).map(|kt| distance_nm / kt * 60.0);
    let weather = weather_of(f, a.ifr, &a.minimums);
    let fuel_at_landing_min = fuel_left_min(a.fuel_gal, a.burn_gph, minutes.map(|m| m / 60.0));
    let reserve_min = reserve_at(a.ifr, f.lat, f.lon, a.now_s.map(|t| t + minutes.unwrap_or(0.0) * 60.0));
    let mut why = Vec::new();
    match &weather {
        Weather::Under(reasons) => why.extend(reasons.iter().cloned()),
        Weather::Unknown => why.push(format!("{}: no weather report to go by", f.ident)),
        Weather::Good => {}
    }
    if let Some(left) = fuel_at_landing_min.filter(|l| *l < reserve_min) {
        why.push(format!("{} min of fuel on landing, under the {} min reserve", js_num(left.round()), js_num(reserve_min)));
    }
    let runway = f.runway_ft.filter(|r| *r > 0.0);
    if let Some(need) = a.runway_min_ft {
        match runway {
            Some(r) if r < need => why.push(format!("longest paved runway {} ft, under the {} ft asked", alt_ft(Some(r)), alt_ft(Some(need)))),
            None => why.push("no paved runway known".to_owned()),
            _ => {}
        }
    }
    if a.need_fuel && !f.fuel {
        why.push("no fuel listed".to_owned());
    }
    if a.within_nm.is_some_and(|w| distance_nm > w) {
        why.push(format!("{} nm away, beyond the {} nm asked", js_num(distance_nm.round()), js_num(a.within_nm.unwrap_or(0.0))));
    }
    let ok = why.is_empty();
    Pick { field: f.clone(), distance_nm, bearing_deg, off_track_deg, minutes, weather, fuel_at_landing_min, reserve_min, ok, why }
}

/// Every field but those excluded, ranked.
pub fn best(a: &Ask, fields: &[Field]) -> Vec<Pick> {
    let mut picks: Vec<Pick> = fields
        .iter()
        .filter(|f| !a.exclude.iter().any(|e| input::same_field(e, &f.ident)))
        .map(|f| pick(a, f))
        .collect();
    let known = |p: &Pick| !matches!(p.weather, Weather::Unknown);
    picks.sort_by(|x, y| {
        y.ok.cmp(&x.ok)
            .then(known(y).cmp(&known(x)))
            .then(x.minutes.unwrap_or(x.distance_nm).total_cmp(&y.minutes.unwrap_or(y.distance_nm)))
    });
    picks
}

fn opt(n: Option<f64>) -> Value {
    n.map_or(Value::Null, Value::Number)
}

fn round1(n: f64) -> f64 {
    (n * 10.0).round() / 10.0
}

/// A pick as the answer gives it.
pub fn to_value(p: &Pick) -> Value {
    let f = &p.field;
    let s = |t: &str| Value::String(t.to_owned());
    Value::Object(vec![
        ("ident".into(), s(&f.ident)),
        ("name".into(), f.name.as_deref().map_or(Value::Null, s)),
        ("lat".into(), Value::Number(f.lat)),
        ("lon".into(), Value::Number(f.lon)),
        ("distance_nm".into(), Value::Number(round1(p.distance_nm))),
        ("bearing_deg".into(), Value::Number(p.bearing_deg.round() % 360.0)),
        ("off_track_deg".into(), opt(p.off_track_deg.map(f64::round))),
        ("side".into(), p.side().map_or(Value::Null, s)),
        ("minutes".into(), opt(p.minutes.map(f64::round))),
        ("category".into(), f.category().map_or(Value::Null, s)),
        ("weather".into(), s(match p.weather {
            Weather::Good => "good",
            Weather::Under(_) => "under",
            Weather::Unknown => "unknown",
        })),
        ("metar".into(), f.raw.as_deref().map_or(Value::Null, s)),
        ("runway_ft".into(), opt(f.runway_ft.filter(|r| *r > 0.0))),
        ("fuel".into(), Value::Bool(f.fuel)),
        ("fuel_at_landing_min".into(), opt(p.fuel_at_landing_min.map(f64::round))),
        ("reserve_min".into(), Value::Number(p.reserve_min)),
        ("ok".into(), Value::Bool(p.ok)),
        ("why".into(), Value::Array(p.why.iter().map(|w| s(w)).collect())),
    ])
}

/// `best_fields`: the ranked fields, at most `limit` (5 where not given).
pub fn rule(name: &str, v: &Value) -> R<Value> {
    let a = ask(name, v)?;
    let fields = input::fields(name, v)?;
    let limit = input::num(name, v, "limit")?.map_or(5, |l| l.max(0.0) as usize);
    Ok(Value::Array(best(&a, &fields).iter().take(limit).map(to_value).collect()))
}
