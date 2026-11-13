//! The nav log's rules and the airplane's performance as crate::call
//! answers them, JSON in and out; the names and their inputs are listed
//! in call.rs with the others, and their shapes in
//! engine/contract/engine.schema.json.

use super::climbs::with_climbs;
use super::descents::{approach_end, with_descents, ApproachFix, End};
use super::holds::{hold_on_leg, Held};
use super::legs::{alternate_leg, assemble_leg, fuel_plan, legs, totals};
use super::plans::{candidates, join_figures, join_options, Flights, Plan};
use super::{read_air, read_leg_air, Obj, Profile, R};
use crate::json::{self, Value};
use wingtip_flight::performance::Climber;

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num(name: &str, v: &Value, key: &str) -> R<f64> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        Some(Value::Array(items)) => Ok(items),
        _ => Err(format!("{name}: \"{key}\" is missing or not a list")),
    }
}

fn objs(name: &str, v: &Value, key: &str) -> R<Vec<Obj>> {
    list(name, v, key)?.iter().map(|o| Obj::read(name, o)).collect()
}

fn profile(name: &str, v: &Value) -> R<Profile> {
    Profile::read(name, v.get("profile").ok_or_else(|| format!("{name}: \"profile\" is missing"))?)
}

/// The airplane, or none: `"profile": null` is no airplane picked, whose
/// legs carry no figure an airplane would make (legs::assemble_leg).
fn opt_profile(name: &str, v: &Value) -> R<Option<Profile>> {
    match v.get("profile") {
        Some(Value::Null) => Ok(None),
        _ => profile(name, v).map(Some),
    }
}

fn place(name: &str, v: &Value, key: &str) -> R<(f64, f64)> {
    let p = v.get(key).ok_or_else(|| format!("{name}: \"{key}\" is missing"))?;
    Ok((num(name, p, "lat")?, num(name, p, "lon")?))
}

fn write(v: &Value) -> String {
    let mut out = String::new();
    json::value(&mut out, v);
    out
}

fn write_objs(items: Vec<Obj>) -> String {
    write(&Value::Array(items.into_iter().map(Obj::value).collect()))
}

fn context<T>(name: &str, r: R<T>) -> R<T> {
    r.map_err(|e| if e.starts_with(name) { e } else { format!("{name}: {e}") })
}

fn plan<'a>(name: &'a str, v: &'a Value, p: Option<&'a Profile>, air: &'a [super::LegAir]) -> R<Option<Plan<'a>>> {
    let fixes = list(name, v, "fixes")?;
    let Some(candidates) = candidates(list(name, v, "segments")?, fixes.len().saturating_sub(1), p)? else { return Ok(None) };
    // No service ceiling asked: a pilot's own airplane's record may not
    // carry one, and its plans then fly no climb (Airplane::climb_tas_kt).
    if let Some(p) = p {
        p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
    }
    Ok(Some(Plan {
        flights: Flights::new(name, fixes, p, air)?,
        candidates,
        departure_elevation_ft: opt_num(name, v, "departure_elevation_ft")?,
    }))
}

/// The rule `name` on `v`, its answer as JSON.
pub fn call(name: &str, v: &Value) -> R<String> {
    context(name, answer(name, v))
}

fn answer(name: &str, v: &Value) -> R<String> {
    Ok(match name {
        "performance_cruise" => {
            let p = profile(name, v)?;
            p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
            let c = p.airplane.cruise(num(name, v, "altitude_ft")?, opt_num(name, v, "oat_c")?);
            format!(
                "{{\"tas_kt\":{},\"fuel_burn_gph\":{},\"power_pct\":{},\"density_altitude_ft\":{}}}",
                write(&Value::Number(c.tas_kt)),
                write(&Value::Number(c.fuel_burn_gph)),
                write(&Value::Number(c.power_pct)),
                write(&Value::Number(c.density_altitude_ft))
            )
        }
        "performance_climb" => {
            let p = profile(name, v)?;
            p.need(name, &["fuel_burn_gph", "service_ceiling_ft"])?;
            let c = Climber::new(&p.airplane).climb(
                num(name, v, "from_ft")?,
                num(name, v, "to_ft")?,
                opt_num(name, v, "isa_dev_c")?.unwrap_or(0.0),
            );
            format!("{{\"minutes\":{},\"gallons\":{}}}", write(&Value::Number(c.minutes)), write(&Value::Number(c.gallons)))
        }
        "navlog_leg" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            if let Some(p) = &p {
                p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
            }
            let leg = assemble_leg(
                place(name, v, "start")?,
                place(name, v, "end")?,
                num(name, v, "altitude_ft")?,
                p.as_ref(),
                &read_air(name, v)?,
                num(name, v, "variation_deg")?,
            )?;
            write(&leg.value())
        }
        "navlog_legs" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            if let Some(p) = &p {
                p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
            }
            write_objs(legs(name, list(name, v, "fixes")?, num(name, v, "altitude_ft")?, p.as_ref(), &read_leg_air(name, v)?)?)
        }
        "navlog_with_climbs" => {
            // No airplane, no climbs: the legs as they are.
            let Some(p) = opt_profile(name, v)? else { return Ok(write_objs(objs(name, v, "legs")?)) };
            p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
            write_objs(with_climbs(&objs(name, v, "legs")?, opt_num(name, v, "start_altitude_ft")?, &p, &Climber::new(&p.airplane))?)
        }
        "navlog_with_descents" => {
            let fix = match v.get("end_fix") {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(s.clone()),
                Some(_) => return Err(format!("{name}: \"end_fix\" is not a string")),
            };
            // Down to the pattern, the descent is finished where the
            // 45-degree entry begins, not over the field: AC 90-66C 11.2
            // and 11.3 have an arriving airplane level at pattern altitude
            // well clear of the pattern before entering it
            // (limits::pattern_entry_start_nm). An approach's is its fix's.
            let before_nm = opt_num(name, v, "end_before_nm")?.unwrap_or_else(|| {
                if fix.is_none() {
                    wingtip_flight::limits::pattern_entry_start_nm()
                } else {
                    0.0
                }
            });
            let end = End { altitude_ft: opt_num(name, v, "end_altitude_ft")?, before_nm, fix };
            // The airplane, for the descent's own speed and flow; none (left
            // out or null) is no airplane, the legs untimed.
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            write_objs(with_descents(&objs(name, v, "legs")?, &objs(name, v, "fixes")?, &end, p.as_ref())?)
        }
        "navlog_approach_end" => {
            let fixes = objs(name, v, "fixes")?
                .iter()
                .map(|f| {
                    Ok(ApproachFix {
                        ident: f.text("ident").unwrap_or("").to_owned(),
                        lat: f.num("lat")?,
                        lon: f.num("lon")?,
                        min_ft: f.opt("min_ft")?,
                        max_ft: f.opt("max_ft")?,
                        missed: f.truthy("missed"),
                    })
                })
                .collect::<R<Vec<_>>>()?;
            match approach_end(&fixes, opt_num(name, v, "cruise_ft")?, place(name, v, "field")?) {
                None => "null".to_owned(),
                Some(end) => format!(
                    "{{\"end_altitude_ft\":{},\"end_before_nm\":{},\"end_fix\":{}}}",
                    write(&Value::Number(end.altitude_ft.unwrap_or_default())),
                    write(&Value::Number(end.before_nm)),
                    write(&end.fix.map(Value::String).unwrap_or(Value::Null))
                ),
            }
        }
        "navlog_totals" => write(&totals(&objs(name, v, "legs")?)?),
        "navlog_fuel_plan" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            if let Some(p) = &p {
                p.need(name, &["fuel_burn_gph"])?;
            }
            let night = match v.get("night") {
                None | Some(Value::Null) => None,
                Some(Value::Bool(b)) => Some(*b),
                Some(_) => return Err(format!("{name}: \"night\" is not true, false or null")),
            };
            let rules = match v.get("rules") {
                None | Some(Value::Null) => "vfr",
                Some(Value::String(s)) if s == "vfr" || s == "ifr" => s.as_str(),
                Some(_) => return Err(format!("{name}: \"rules\" is \"vfr\" or \"ifr\"")),
            };
            write(&fuel_plan(
                opt_num(name, v, "total_fuel_gal")?,
                p.as_ref(),
                night,
                rules,
                opt_num(name, v, "alternate_gal")?.unwrap_or(0.0),
            ))
        }
        "navlog_alternate_leg" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            if let Some(p) = &p {
                p.need(name, &["cruise_tas_kt", "fuel_burn_gph"])?;
            }
            let air = match v.get("air") {
                None | Some(Value::Null) => None,
                Some(a @ Value::Object(_)) => Some((read_air(name, a)?, num(name, a, "variation_deg")?)),
                Some(_) => return Err(format!("{name}: \"air\" is not an object")),
            };
            let (dest, alternate) = (v.get("dest").unwrap_or(&Value::Null), v.get("alternate").unwrap_or(&Value::Null));
            write(&alternate_leg(name, dest, alternate, num(name, v, "altitude_ft")?, p.as_ref(), air.as_ref().map(|(a, var)| (a, *var)))?)
        }
        "navlog_candidates" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            let count = num(name, v, "legs")?;
            match candidates(list(name, v, "segments")?, count as usize, p.as_ref())? {
                None => "null".to_owned(),
                Some(c) => write(&Value::Array(c.into_iter().map(|o| Value::Array(o.into_iter().map(Value::Number).collect())).collect())),
            }
        }
        "navlog_plans" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            let air = read_leg_air(name, v)?;
            match plan(name, v, p.as_ref(), &air)? {
                None => "{\"plans\":{},\"by_altitude\":[]}".to_owned(),
                Some(plan) => write(&plan.plans()?),
            }
        }
        "navlog_legs_at" => {
            let p = match v.get("profile") {
                None | Some(Value::Null) => None,
                Some(_) => Some(profile(name, v)?),
            };
            let air = read_leg_air(name, v)?;
            match plan(name, v, p.as_ref(), &air)? {
                None => return Err(format!("{name}: some leg has no legal altitude, so no altitude can be flown on all of them")),
                Some(plan) => write_objs(plan.legs_at(num(name, v, "target_ft")?)?),
            }
        }
        "navlog_join_plans" | "navlog_join_figures" => {
            let by_hop = list(name, v, "by_hop")?
                .iter()
                .map(|hop| match hop {
                    Value::Array(items) => items.iter().map(|o| Obj::read(name, o)).collect::<R<Vec<_>>>(),
                    _ => Err(format!("{name}: a hop's are not a list")),
                })
                .collect::<R<Vec<_>>>()?;
            let lengths = list(name, v, "lengths")?
                .iter()
                .map(|n| n.as_f64().ok_or_else(|| format!("{name}: a length is not a number")))
                .collect::<R<Vec<_>>>()?;
            if lengths.len() != by_hop.len() {
                return Err(format!("{name}: {} hops and {} lengths", by_hop.len(), lengths.len()));
            }
            let joined = if name == "navlog_join_plans" { join_options(&by_hop, &lengths)? } else { join_figures(&by_hop, &lengths)? };
            write(&Value::Array(joined))
        }
        "navlog_hold" => {
            let leg = Obj::read(name, v.get("leg").unwrap_or(&Value::Null))?;
            let before = match v.get("before") {
                None | Some(Value::Null) => leg.clone(),
                Some(b) => Obj::read(name, b)?,
            };
            let hold = Held::read(name, v.get("hold").unwrap_or(&Value::Null))?;
            let at_end = matches!(v.get("at_end"), Some(Value::Bool(true)));
            write(&hold_on_leg(&leg, &before, &hold, place(name, v, "fix")?, num(name, v, "variation_deg")?, at_end)?.value())
        }
        "navlog_fuel_stop_need" => {
            let totals = Obj::read(name, v.get("totals").unwrap_or(&Value::Null))?;
            let legs = objs(name, v, "legs")?
                .iter()
                .map(|l| Ok((l.opt("distance_nm")?.unwrap_or(0.0), l.opt("fuel_gal")?)))
                .collect::<R<Vec<_>>>()?;
            let need = super::fuel_stop::fuel_stop_need(
                &totals,
                &legs,
                place(name, v, "start")?,
                place(name, v, "end")?,
                num(name, v, "depart_s")?,
            )?;
            need.map_or_else(|| "null".to_owned(), |n| write(&n.value()))
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    })
}
