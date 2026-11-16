//! The altitude rules as crate::call answers them, JSON in and out; each
//! name, its input and its answer are in its file in
//! crates/altitude/contract, which the dispatcher and
//! engine/contract/engine.schema.json are generated from.

use super::floor::{self, Ground, Obstacle, CORRIDOR_HALF_WIDTH_NM, IFR_OBSTACLE_RADIUS_NM};
use super::select;
use super::words::{self, Via};
use super::{cautions, clouds, congested, cruising, profile_calls};
use crate::json::{self, Value};

pub(super) type R<T> = Result<T, String>;

pub(super) fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

pub(super) fn num(name: &str, v: &Value, key: &str) -> R<f64> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

pub(super) fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

pub(super) fn nums(name: &str, v: &Value, key: &str) -> R<Vec<f64>> {
    list(name, v, key)?.iter().map(|x| x.as_f64().ok_or_else(|| format!("{name}: \"{key}\" holds a non-number"))).collect()
}

fn point(name: &str, v: Option<&Value>) -> R<(f64, f64)> {
    match v.and_then(Value::as_array) {
        Some([lat, lon]) => match (lat.as_f64(), lon.as_f64()) {
            (Some(lat), Some(lon)) => Ok((lat, lon)),
            _ => Err(format!("{name}: a point is not [lat, lon]")),
        },
        _ => Err(format!("{name}: a point is not [lat, lon]")),
    }
}

pub(super) fn written(v: &Value) -> String {
    let mut out = String::new();
    json::value(&mut out, v);
    out
}

fn number(x: Option<f64>) -> String {
    let mut out = String::new();
    json::opt_number(&mut out, x);
    out
}

fn numbers(xs: &[f64]) -> String {
    written(&Value::Array(xs.iter().copied().map(Value::Number).collect()))
}

pub(super) fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

fn ground(name: &str, v: &Value) -> R<Ground> {
    let g = v.get("ground").ok_or_else(|| format!("{name}: \"ground\" is missing"))?;
    let congested = match g.get("congested") {
        None | Some(Value::Null) => None,
        Some(Value::Array(items)) => Some(items.iter().map(|c| matches!(c, Value::Bool(true))).collect()),
        Some(_) => return Err(format!("{name}: the ground's \"congested\" is not a list")),
    };
    let ground =
        Ground { along_nm: nums(name, g, "along_nm")?, high_ft: nums(name, g, "high_ft")?, low_ft: nums(name, g, "low_ft")?, congested };
    if ground.high_ft.len() != ground.along_nm.len() || ground.low_ft.len() != ground.along_nm.len() {
        return Err(format!("{name}: the ground's lists are not of one length"));
    }
    Ok(ground)
}

fn obstacle_at(name: &str, o: &Value) -> R<((f64, f64), f64)> {
    Ok(((num(name, o, "lat")?, num(name, o, "lon")?), num(name, o, "amsl_ft")?))
}

/// `floor_along_path`: a leg's floor over the path flown in its place
/// (floor::along_path), the bounding floor as it came, its lowest ground
/// the least of all. Its own entry, not `call`'s: the planner's alone, so
/// the web's WebAssembly, which dispatches `call`, carries none of it.
pub fn floor_along_path(name: &str, v: &Value) -> R<String> {
    let floors = list(name, v, "floors")?;
    let figures = floors.iter().map(|f| Ok((num(name, f, "floor_ft")?, opt_num(name, f, "lowest_ground_ft")?))).collect::<R<Vec<_>>>()?;
    let Some((bound, lowest)) = floor::along_path(&figures) else { return Err(format!("{name}: \"floors\" is empty")) };
    let mut out = floors[bound].clone();
    if let (Value::Object(members), Some(low)) = (&mut out, lowest) {
        for (key, value) in members.iter_mut() {
            if key == "lowest_ground_ft" {
                *value = Value::Number(low);
            }
        }
    }
    Ok(written(&out))
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        "legal_cruising_altitudes" => {
            let (floor, ceiling, course) =
                (num(name, v, "floor_ft")?, opt_num(name, v, "ceiling_ft")?, num(name, v, "magnetic_course_deg")?);
            Ok(numbers(&if v.get("rules").and_then(Value::as_str) == Some("ifr") {
                cruising::legal_ifr(floor, ceiling, course)
            } else {
                cruising::legal_vfr(floor, ceiling, course, opt_num(name, v, "rule_from_ft")?)
            }))
        }
        "highest_under_clouds_ft" => Ok(number(Some(clouds::highest_under_ft(num(name, v, "cloud_base_ft")?)))),
        "cloud_clearance_at_ft" => Ok(number(Some(clouds::clearance_at_ft(num(name, v, "altitude_ft")?)))),
        "congested_points" => congested_points(name, v),
        "altitude_wheel" => Ok(numbers(&cruising::wheel(&nums(name, v, "legal_ft")?, opt_num(name, v, "flown_ft")?))),
        "profile_clearance" => profile_calls::profile_clearance(name, v),
        "altitude_advisor" => profile_calls::altitude_advisor(name, v),
        "ifr_obstacle_radius_nm" => Ok(number(Some(IFR_OBSTACLE_RADIUS_NM))),
        "floor_corridor_nm" => Ok(number(Some(CORRIDOR_HALF_WIDTH_NM))),
        "airway_floor_ft" => Ok(number(floor::published(opt_num(name, v, "mea_ft")?, opt_num(name, v, "gnss_mea_ft")?))),
        "vfr_floors" => {
            let obstacles: Vec<Obstacle> = list(name, v, "obstacles")?
                .iter()
                .map(|o| {
                    let (at, amsl_ft) = obstacle_at(name, o)?;
                    Ok(Obstacle {
                        at,
                        amsl_ft,
                        kind: o.get("type").and_then(Value::as_str).map(str::to_owned),
                        congested: matches!(o.get("congested"), Some(Value::Bool(true))),
                    })
                })
                .collect::<R<_>>()?;
            let floors = floor::vfr(
                point(name, v.get("start"))?,
                point(name, v.get("end"))?,
                &nums(name, v, "breaks_nm")?,
                &ground(name, v)?,
                &obstacles,
            )
            .map_err(|e| format!("{name}: {e}"))?;
            Ok(written(&Value::Array(
                floors
                    .into_iter()
                    .map(|f| {
                        obj(vec![
                            ("floor_ft", Value::Number(f.floor_ft)),
                            ("lowest_ground_ft", Value::Number(f.lowest_ground_ft)),
                            ("highest_ft", Value::Number(f.highest_ft)),
                            ("highest_is_obstacle", Value::Bool(f.highest_is_obstacle)),
                            ("obstacle_type", f.obstacle_type.map_or(Value::Null, Value::String)),
                            ("clearance_ft", Value::Number(f.clearance_ft)),
                            ("congested", f.congested.map_or(Value::Null, Value::Bool)),
                        ])
                    })
                    .collect(),
            )))
        }
        "ifr_floors" => {
            // Each leg's two ends and the highest ground along it.
            type Leg = ((f64, f64), (f64, f64), f64);
            let legs: Vec<Leg> = list(name, v, "legs")?
                .iter()
                .map(|l| Ok((point(name, l.get("a"))?, point(name, l.get("b"))?, num(name, l, "ground_ft")?)))
                .collect::<R<_>>()?;
            let obstacles: Vec<((f64, f64), f64)> = list(name, v, "obstacles")?.iter().map(|o| obstacle_at(name, o)).collect::<R<_>>()?;
            Ok(written(&Value::Array(
                floor::ifr(&legs, &obstacles)
                    .into_iter()
                    .map(|f| {
                        obj(vec![
                            ("floor_ft", Value::Number(f.floor_ft)),
                            ("highest_ft", Value::Number(f.highest_ft)),
                            ("highest_is_obstacle", Value::Bool(f.highest_is_obstacle)),
                            ("mountainous", Value::Bool(f.mountainous)),
                        ])
                    })
                    .collect(),
            )))
        }
        "select_cruise_altitude" => select::select(name, v).map(|a| written(&a)),
        "altitude_anyway" => {
            let selection = v.get("selection").ok_or_else(|| format!("{name}: \"selection\" is missing"))?;
            Ok(number(words::anyway(selection)))
        }
        "no_altitude" => {
            let selection = v.get("selection").ok_or_else(|| format!("{name}: \"selection\" is missing"))?;
            let between = match v.get("between").and_then(Value::as_array) {
                Some([a, b]) => Some((a.as_str().unwrap_or(""), b.as_str().unwrap_or(""))),
                _ => None,
            };
            let via = match v.get("via") {
                Some(w @ Value::Object(_)) => Some(Via {
                    ident: w.get("ident").and_then(Value::as_str).unwrap_or("").to_owned(),
                    added_nm: opt_num(name, w, "added_nm")?.unwrap_or(0.0),
                }),
                _ => None,
            };
            let place = v.get("where").and_then(Value::as_str);
            let why = words::no_altitude(selection, between, via.as_ref(), place);
            let detail = why.detail();
            Ok(written(&obj(vec![
                ("title", Value::String(why.title)),
                ("brief", Value::String(why.brief)),
                ("reasons", Value::Array(why.reasons.into_iter().map(Value::String).collect())),
                ("advice", Value::String(why.advice)),
                ("class_b", Value::Bool(why.class_b)),
                ("detail", Value::String(detail)),
            ])))
        }
        "own_altitude_caution" => {
            let selection = v.get("selection").ok_or_else(|| format!("{name}: \"selection\" is missing"))?;
            let between: Vec<&str> = list(name, v, "between")?.iter().map(|b| b.as_str().unwrap_or("")).collect();
            let [from, to] = between[..] else {
                return Err(format!("{name}: \"between\" is not [from, to]"));
            };
            let profile = v.get("profile").filter(|p| !matches!(p, Value::Null));
            Ok(match cautions::own_altitude(selection, list(name, v, "legs")?, profile) {
                None => "null".to_owned(),
                Some(c) => written(&obj(vec![
                    ("from_ident", Value::String(from.to_owned())),
                    ("to_ident", Value::String(to.to_owned())),
                    ("altitude_ft", Value::Number(c.altitude_ft)),
                    ("reasons", Value::Array(c.reasons.into_iter().map(Value::String).collect())),
                ])),
            })
        }
        "floor_caution" => {
            let segment = v.get("segment").ok_or_else(|| format!("{name}: \"segment\" is missing"))?;
            Ok(written(&cautions::floor(segment, num(name, v, "altitude_ft")?).map_or(Value::Null, Value::String)))
        }
        "prohibited_caution" => {
            let selection = v.get("selection").ok_or_else(|| format!("{name}: \"selection\" is missing"))?;
            Ok(written(&Value::Array(cautions::prohibited(selection).into_iter().map(Value::String).collect())))
        }
        _ => Err(format!("altitude has no rule called {name:?}")),
    }
}

/// `congested_points`: for each of `points` ([lat, lon]), whether it is
/// over one of `areas` or within 91.119(b)'s 2,000 ft of one (congested.rs).
/// `candidates`, where given, names for each point the areas worth
/// measuring it against (indices into `areas`: the planner's box query
/// over the towns), so a route over Chicago measures each obstacle against
/// the towns near it alone and sends each outline once.
fn congested_points(name: &str, v: &Value) -> R<String> {
    let bad = || format!("{name}: an area is not [[[[lon, lat], ...], ...], ...]");
    let areas: Vec<congested::Area> = list(name, v, "areas")?
        .iter()
        .map(|a| {
            a.as_array()
                .ok_or_else(bad)?
                .iter()
                .map(|rings| {
                    rings
                        .as_array()
                        .ok_or_else(bad)?
                        .iter()
                        .map(|ring| {
                            ring.as_array()
                                .ok_or_else(bad)?
                                .iter()
                                .map(|p| match p.as_array() {
                                    Some([x, y]) => Ok((x.as_f64().ok_or_else(bad)?, y.as_f64().ok_or_else(bad)?)),
                                    _ => Err(bad()),
                                })
                                .collect()
                        })
                        .collect()
                })
                .collect()
        })
        .collect::<R<_>>()?;
    let candidates = match v.get("candidates") {
        None | Some(Value::Null) => None,
        Some(Value::Array(c)) => Some(c),
        Some(_) => return Err(format!("{name}: \"candidates\" is not a list")),
    };
    let all: Vec<&congested::Area> = areas.iter().collect();
    let mut out = String::from("[");
    for (i, p) in list(name, v, "points")?.iter().enumerate() {
        let (lat, lon) = point(name, Some(p))?;
        let near: Vec<&congested::Area> = match candidates {
            None => all.clone(),
            Some(c) => c
                .get(i)
                .and_then(Value::as_array)
                .ok_or_else(|| format!("{name}: \"candidates\" has no list for point {i}"))?
                .iter()
                .map(|j| {
                    j.as_f64().and_then(|j| areas.get(j as usize)).ok_or_else(|| format!("{name}: a candidate is not an area's index"))
                })
                .collect::<R<_>>()?,
        };
        if i > 0 {
            out.push(',');
        }
        out.push_str(if congested::congested(&near, lat, lon) { "true" } else { "false" });
    }
    out.push(']');
    Ok(out)
}
