//! The pilot pages' figures by name (engine/facade/src/call.rs looks each
//! up from its contract file, crates/procedures/contract/<name>.json): a
//! hold's entry and legs (AIM 5-3-8), lost communications' altitudes (14
//! CFR 91.185), the diversion drill (ACS PA.VI.C), the fuel strip (91.151,
//! 91.167), and a figure written as the web writes it. The debrief's are
//! debrief_calls.rs.

use super::{diversion, holding, lost_comms, strip, words};
use crate::json::{self, Value};
use wingtip_core::ask::{opt_num_in, Ask};
use wingtip_flight::limits;

/// A hold (holding.rs, AIM 5-3-8).
pub fn hold(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "holding" => {
            let right = match ask.opt_str("turns")? {
                "" | "right" => true,
                "left" => false,
                other => return Err(format!("holding: turns are \"right\" or \"left\", not {other:?}")),
            };
            return Ok(holding::holding_json(
                ask.num("inbound")?,
                ask.num("heading")?,
                right,
                ask.opt_num("tas_kt")?,
                ask.opt_num("wind_from")?,
                ask.opt_num("wind_kt")?,
                ask.opt_num("altitude_ft")?,
            ));
        }
        "holding_leg_minutes" => json::number(&mut out, holding::leg_minutes(ask.opt_num("altitude_ft")?)),
        "hold_entry" => {
            json::string(&mut out, holding::entry(ask.num("arrival_deg")?, ask.num("inbound_deg")?, ask.opt_str("turns")? != "left").key())
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// The altitude flown on each segment after a two-way radio failure (14
/// CFR 91.185, lost_comms.rs).
pub fn lost_comms(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let segments = ask
        .list("segments")?
        .iter()
        .map(|s| {
            let seg = match s.get("name") {
                None | Some(Value::Null) => String::new(),
                Some(Value::String(n)) => n.clone(),
                Some(_) => return Err(format!("{name}: a segment's \"name\" is not a string")),
            };
            Ok((seg, opt_num_in(name, s, "minimum_ft")?))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let expected_from = ask.opt_num("expected_from")?.unwrap_or(0.0);
    if expected_from.fract() != 0.0 {
        return Err(format!("{name}: \"expected_from\" is a segment's index, a whole number"));
    }
    Ok(lost_comms::lost_comms_json(
        &segments,
        ask.opt_num("assigned_ft")?,
        ask.opt_num("expected_ft")?,
        expected_from as i64,
        ask.opt_bool("approach_fix")?,
        ask.opt_str("efc")?,
        ask.opt_str("eta")?,
    ))
}

/// The diversion drill (diversion.rs, ACS PA.VI.C).
pub fn diversion(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    match name {
        "diversion" => {
            // No wind forecast is calm, as the planner flies the leg in.
            let (wind_from_deg, wind_kt) = match v.get("wind") {
                None | Some(Value::Null) => (0.0, 0.0),
                Some(w @ Value::Object(_)) => {
                    (opt_num_in(name, w, "wind_dir_true_deg")?.unwrap_or(0.0), opt_num_in(name, w, "wind_speed_kt")?.unwrap_or(0.0))
                }
                Some(_) => return Err(format!("{name}: \"wind\" is not an object")),
            };
            let air = diversion::Air {
                tas_kt: ask.num("tas_kt")?,
                fuel_burn_gph: ask.num("fuel_burn_gph")?,
                magnetic_variation_deg: ask.num("magnetic_variation_deg")?,
                wind_from_deg,
                wind_kt,
            };
            let typed = [ask.opt_num("mh")?, ask.opt_num("gs")?, ask.opt_num("ete")?, ask.opt_num("fuel")?];
            Ok(diversion::diversion_json(&air, ask.num("true_course_deg")?, ask.num("distance_nm")?, ask.opt_str("to")?, typed))
        }
        "workings_right" => {
            let key = ask.str("key")?;
            match diversion::workings_right(key, ask.num("typed")?, ask.num("answer")?) {
                Some(right) => Ok(right.to_string()),
                None => Err(format!("workings_right: \"key\" is wca, th, mh, gs, ete or fuel, not {key:?}")),
            }
        }
        "wind_triangle" => {
            let solved = diversion::wind_triangle(ask.num("tc")?, ask.num("tas")?, ask.num("wind_from_deg")?, ask.num("wind_kt")?);
            Ok(match solved {
                None => "null".to_owned(),
                Some((wca, th, gs)) => {
                    let mut out = String::from("{\"wca\":");
                    json::number(&mut out, wca);
                    out.push_str(",\"th\":");
                    json::number(&mut out, th);
                    out.push_str(",\"gs\":");
                    json::number(&mut out, gs);
                    out.push('}');
                    out
                }
            })
        }
        "diversion_reasonable" => {
            let key = ask.str("key")?;
            match diversion::reasonable(key, ask.num("typed")?, ask.num("exact")?) {
                Some(ok) => Ok(ok.to_string()),
                None => Err(format!("diversion_reasonable: no estimate is called {key:?}")),
            }
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// The fuel strip's figures (strip.rs: 91.151, 91.167).
pub fn fuel(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    match name {
        "strip_fuel" => strip_fuel(&ask),
        "fuel_in_tanks" => {
            let points = ask
                .list("points")?
                .iter()
                .map(|p| {
                    let flag = |k: &str| matches!(p.get(k), Some(Value::Bool(true)));
                    Ok(strip::TankPoint {
                        departure: flag("departure"),
                        fuel_gal: opt_num_in(name, p, "fuel_gal")?,
                        refuel: flag("refuel"),
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            let mut out = String::from("[");
            for (i, at) in strip::tanks(&points, ask.num("usable_gal")?, ask.num("taxi_gal")?, ask.num("reserve_gal")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                match at {
                    None => out.push_str("null"),
                    Some((gal, low)) => {
                        out.push_str("{\"gal\":");
                        json::number(&mut out, *gal);
                        out.push_str(if *low { ",\"low\":true}" } else { ",\"low\":false}" });
                    }
                }
            }
            out.push(']');
            Ok(out)
        }
        "fuel_estimate" => {
            let (minutes, trip, required) = strip::estimate(
                ask.num("distance_nm")?,
                ask.opt_num("cruise_tas_kt")?,
                ask.opt_num("fuel_burn_gph")?,
                ask.opt_num("taxi_fuel_gal")?,
            );
            let mut out = String::from("{\"minutes\":");
            json::opt_number(&mut out, minutes);
            out.push_str(",\"trip_gal\":");
            json::opt_number(&mut out, trip);
            out.push_str(",\"required_gal\":");
            json::opt_number(&mut out, required);
            out.push('}');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// The strip's fuel (strip::fuel_figure): `{"required_gal", "short":
/// [{"name", "short_gal"}]}`.
fn strip_fuel(ask: &Ask) -> Result<String, String> {
    let name = ask.name;
    let hops = match ask.v.get("hops") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(list)) => list
            .iter()
            .map(|h| {
                let s = |k: &str| h.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
                Ok(strip::Hop {
                    departure: s("departure"),
                    destination: s("destination"),
                    fuel_required_gal: opt_num_in(name, h, "fuel_required_gal")?,
                    fuel_margin_gal: opt_num_in(name, h, "fuel_margin_gal")?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?,
        Some(_) => return Err(format!("{name}: \"hops\" is not a list")),
    };
    let hop = ask.opt_num("hop")?.unwrap_or(0.0).max(0.0) as usize;
    let (required, short) =
        strip::fuel_figure(ask.opt_num("fuel_required_gal")?, ask.opt_num("fuel_margin_gal")?, &hops, hop, ask.opt_num("burnt_gal")?);
    let mut out = String::from("{\"required_gal\":");
    json::opt_number(&mut out, required);
    out.push_str(",\"short\":[");
    for (i, s) in short.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"name\":");
        json::string(&mut out, &s.name);
        out.push_str(",\"short_gal\":");
        json::number(&mut out, s.short_gal);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

/// A figure written as the web app writes it (words.rs), for the
/// planner's words that are compared with the web's word for word; and an
/// altitude as said (AIM 4-2-9: feet below 18,000 ft, a flight level from
/// there up, limits.rs).
pub fn written(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    let text = match name {
        "words_num" => words::js_opt(ask.opt_num("n")?),
        "words_one" => {
            json::number(&mut out, words::one(ask.num("n")?));
            return Ok(out);
        }
        "words_to_fixed" => {
            let digits = ask.opt_num("digits")?.unwrap_or(1.0);
            if !(0.0..=20.0).contains(&digits) || digits.fract() != 0.0 {
                return Err(format!("words_to_fixed: \"digits\" is a whole number from 0 to 20, not {digits}"));
            }
            words::to_fixed(ask.num("n")?, digits as usize)
        }
        "words_grouped" => words::grouped(ask.num("n")?),
        "words_alt_ft" => words::alt_ft(ask.opt_num("ft")?),
        "words_flight_level" => words::flight_level(ask.opt_num("ft")?),
        "words_ceiling_and_visibility" => words::ceiling_and_visibility(ask.opt_num("ceiling_ft")?, ask.opt_num("visibility_sm")?),
        "altitude_said" => {
            let ft = ask.num("ft")?;
            if limits::is_flight_level(ft) {
                format!("FL{}", (ft / 100.0).round())
            } else {
                words::feet(ft)
            }
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    json::string(&mut out, &text);
    Ok(out)
}
