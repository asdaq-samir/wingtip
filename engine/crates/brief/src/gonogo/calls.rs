//! The Go / No-Go's rules by name (crate::call lists them): each reads its
//! input as the planner's and the web's own objects in snake_case -- a
//! briefing's METARs and runways, a profile's tables and loading, the
//! web's VerdictInput and FratInput -- and answers the planner's JSON.
//!
//! JavaScript's truth is read where the web reads a value as true or
//! false (an empty object is there; an empty string, 0 and null are not),
//! and a member left out is told from one sent as null where the web tells
//! them apart (a VOR check, an alternate's `good`).

use super::frat::{self, Currency, Inspections, Squawk, VorCheck};
use super::icing;
use super::minimums::{self, Landing, Minimums, Report as Winds, RunwayWind};
use super::pass_times;
use super::runways::{self, Airplane, End, Field, Picks, Report, Runway, ShortField};
use super::verdict::{self, Alternates, FiledAlternate, Item};
use super::weight_balance::{self, Load, Loading, Station};
use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// A rule's reading of its input, with its name in each complaint.
#[derive(Clone, Copy)]
pub(crate) struct In<'a> {
    pub(crate) name: &'a str,
}

impl In<'_> {
    pub(crate) fn err<T>(&self, key: &str, what: &str) -> R<T> {
        Err(format!("{}: \"{key}\" {what}", self.name))
    }

    pub(crate) fn opt_num(&self, v: &Value, key: &str) -> R<Option<f64>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Number(n)) => Ok(Some(*n)),
            Some(_) => self.err(key, "is not a number"),
        }
    }

    pub(crate) fn opt_bool(&self, v: &Value, key: &str) -> R<Option<bool>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Bool(b)) => Ok(Some(*b)),
            Some(_) => self.err(key, "is not true or false"),
        }
    }

    pub(crate) fn num(&self, v: &Value, key: &str) -> R<f64> {
        self.opt_num(v, key)?.map_or_else(|| self.err(key, "is missing"), Ok)
    }

    pub(crate) fn opt_str(&self, v: &Value, key: &str) -> R<Option<String>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.clone())),
            Some(_) => self.err(key, "is not a string"),
        }
    }

    pub(crate) fn str(&self, v: &Value, key: &str) -> R<String> {
        self.opt_str(v, key)?.map_or_else(|| self.err(key, "is missing"), Ok)
    }

    pub(crate) fn strings(&self, v: &Value, key: &str) -> R<Vec<String>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(vec![]),
            Some(Value::Array(items)) => {
                items.iter().map(|s| s.as_str().map(str::to_owned).map_or_else(|| self.err(key, "holds a non-string"), Ok)).collect()
            }
            Some(_) => self.err(key, "is not a list"),
        }
    }

    pub(crate) fn list<'v>(&self, v: &'v Value, key: &str) -> R<&'v [Value]> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(&[]),
            Some(Value::Array(items)) => Ok(items),
            Some(_) => self.err(key, "is not a list"),
        }
    }

    pub(crate) fn nums(&self, v: &Value, key: &str) -> R<Vec<f64>> {
        self.list(v, key)?.iter().map(|x| x.as_f64().map_or_else(|| self.err(key, "holds a non-number"), Ok)).collect()
    }

    /// An object member, None where it is missing or null.
    pub(crate) fn obj<'v>(&self, v: &'v Value, key: &str) -> R<Option<&'v Value>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(o @ Value::Object(_)) => Ok(Some(o)),
            Some(_) => self.err(key, "is not an object"),
        }
    }
}

/// JavaScript's truth of a member: false where it is missing, null,
/// false, 0, NaN or ""; an object or a list, even an empty one, is true.
pub(crate) fn truth(v: &Value, key: &str) -> bool {
    truthy(v.get(key))
}

/// Whether a section left out a member it decides its finding by: one not
/// sent at all, as `{"weather": {}}` sends nothing, so the section checked
/// nothing and its finding is "unknown" rather than "ok" (a null is sent:
/// the web's and the planner's say "none" so).
fn left_out(v: &Value, keys: &[&str]) -> bool {
    keys.iter().any(|k| v.get(k).is_none())
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => *n != 0.0 && !n.is_nan(),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

fn members(v: Option<&Value>) -> &[(String, Value)] {
    match v {
        Some(Value::Object(m)) => m,
        _ => &[],
    }
}

/// The rule `name` on `v`, as the Go / No-Go's contract files (crates/brief/contract) name it to the dispatcher.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    match name {
        "departure_window" => {
            super::window_calls::read(i, v).map(|input| super::window_calls::answer_json(&super::window::departure_window(&input)))
        }
        "gonogo_under_minimums" => under_minimums_rule(i, v),
        "gonogo_icing" => icing_rule(i, v),
        "gonogo_icing_line" => icing_line_rule(i, v),
        "gonogo_risk" => frat_input(i, v).map(|f| frat::assessment_json(&frat::assess(&f))),
        "gonogo_self_checks" => Ok(frat::self_checks_json()),
        "gonogo_risk_line" => (|| {
            let score = i.num(v, "score")?;
            let mut out = String::new();
            json::string(&mut out, &frat::risk_line(&i.str(v, "level")?, score as i64));
            Ok(out)
        })(),
        "gonogo_end_distance" => end_distance_rule(i, v),
        "gonogo_density_altitude" => (|| {
            let mut out = String::new();
            json::number(&mut out, runways::density_altitude_ft(i.num(v, "pressure_alt_ft")?, i.num(v, "temp_c")?));
            Ok(out)
        })(),
        "gonogo_soft_surface" => (|| {
            let r = Runway { surface: i.opt_str(v, "surface")?, ..Default::default() };
            Ok(runways::soft_surface(Some(&r)).to_string())
        })(),
        "gonogo_runway_number" => (|| {
            let mut out = String::new();
            json::string(&mut out, runways::runway_number(&i.str(v, "ident")?));
            Ok(out)
        })(),
        "gonogo_runway_flown" => (|| {
            let rs = runway_list(i, v, "runways")?;
            Ok(flown_json(runways::runway_flown(&rs, i.opt_str(v, "picked")?.as_deref())))
        })(),
        "gonogo_runway_in_use" => runway_list(i, v, "runways").map(|rs| flown_json(runways::runway_in_use(&rs))),
        "gonogo_picked_end" => (|| {
            let p = picks(i, v.get("picks"))?;
            let kind = i.str(v, "kind")?;
            let end = runways::picked_end(p.as_ref(), &i.str(v, "ident")?, kind == "takeoff", truth(v, "departure"));
            let mut out = String::new();
            json::opt_string(&mut out, end);
            Ok(out)
        })(),
        "gonogo_runway_checks" => runway_checks_rule(i, v),
        "gonogo_balance" => (|| {
            let l = loading_for_load(i, v)?;
            let load = load(i, v)?;
            Ok(weight_balance::balance_json(&weight_balance::balance(&l, &load, i.opt_num(v, "trip_fuel_gal")?)))
        })(),
        "gonogo_default_load" => {
            (|| Ok(weight_balance::load_json(&weight_balance::default_load(&loading(i, v)?, i.num(v, "fuel_gal")?))))()
        }
        "gonogo_pass_minutes" => (|| {
            let legs =
                i.list(v, "legs")?.iter().map(|l| Ok((i.num(l, "distance_nm")?, i.opt_num(l, "ete_min")?))).collect::<R<Vec<_>>>()?;
            let mut out = String::new();
            json::opt_number(&mut out, pass_times::pass_minutes(&legs, i.num(v, "along_nm")?));
            Ok(out)
        })(),
        "gonogo_tfr_when" => (|| {
            let us = |key: &str| -> R<Option<i64>> { Ok(i.opt_num(v, key)?.map(|t| t as i64)) };
            let at = i.num(v, "at_us")? as i64;
            Ok(format!("\"{}\"", pass_times::tfr_when(at, us("effective_us")?, us("expires_us")?)))
        })(),
        "gonogo_hazard_window" => (|| {
            let margin_min = i.opt_num(v, "margin_min")?.unwrap_or(pass_times::PASS_MARGIN_MIN as f64);
            let when = pass_times::window_when(
                i.num(v, "enter")?,
                i.num(v, "leave")?,
                i.opt_num(v, "valid_from")?,
                i.opt_num(v, "valid_to")?,
                margin_min * 60.0,
            );
            let mut out = String::new();
            json::opt_string(&mut out, when);
            Ok(out)
        })(),
        "gonogo_sua_when" => (|| {
            let clock = |key: &str| -> R<Option<(u32, u32)>> {
                match v.get(key) {
                    None | Some(Value::Null) => Ok(None),
                    Some(Value::Array(dm)) if dm.len() == 2 => match (dm[0].as_f64(), dm[1].as_f64()) {
                        (Some(d), Some(m)) if (0.0..7.0).contains(&d) && m >= 0.0 => Ok(Some((d as u32, m as u32))),
                        _ => i.err(key, "is not [day 0-6, minute]"),
                    },
                    Some(_) => i.err(key, "is not [day, minute]"),
                }
            };
            let utc = clock("utc")?.map_or_else(|| i.err("utc", "is missing"), Ok)?;
            Ok(format!("\"{}\"", pass_times::sua_when(i.opt_str(v, "times_of_use")?.as_deref(), utc, clock("local")?)))
        })(),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

mod inputs;
pub(crate) use inputs::*;
mod rules;
pub(crate) use rules::*;
mod runway_rules;
pub(crate) use runway_rules::*;
