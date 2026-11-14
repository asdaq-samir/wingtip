//! The flight's rules by name (engine/facade/src/call.rs looks each name
//! up from its contract file, crates/flight/contract/<name>.json): the
//! atmosphere, 91.151's reserve and 91.159's cruising altitudes
//! (flight.rs), 1.1's night (sun.rs), the altitudes a flight may be
//! planned at (limits.rs) and FAA Form 7233-4's items (filing.rs), as the
//! planner's wingtip_native functions of the same names work them out.

use crate::{field, filing, flight, limits, sun};
use wingtip_core::ask::Ask;
use wingtip_core::json::{self, Value};

/// A figure of the flight's own (flight.rs).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    let figure = match name {
        "reserve_min" => flight::reserve_min(ask.opt_bool("ifr")?, ask.opt_bool("night")?),
        "isa_temp_c" => flight::isa_temp_c(ask.num("altitude_ft")?),
        "density_ratio" => flight::density_ratio(ask.num("altitude_ft")?, ask.num("oat_c")?),
        "density_altitude_ft" => flight::density_altitude_ft(ask.num("sigma")?),
        "pressure_altitude_ft" => flight::pressure_altitude_ft(ask.num("elevation_ft")?, ask.num("altimeter_inhg")?),
        "lowest_vfr_cruising_altitude" => flight::lowest_vfr_cruising_altitude(ask.num("floor_ft")?, ask.num("magnetic_course_deg")?),
        "is_eastbound" => return Ok(flight::is_eastbound(ask.num("magnetic_course_deg")?).to_string()),
        "groundspeed_kt" => flight::groundspeed_kt(
            ask.num("true_course_deg")?,
            ask.num("wind_from_deg")?,
            ask.num("wind_kt")?,
            ask.num("tas_kt")?,
            ask.num("wca_deg")?,
        ),
        // The turnaround at a stop and the cruise reference altitude.
        "planning_figures" => {
            out.push_str("{\"turnaround_min\":");
            json::number(&mut out, flight::TURNAROUND_MIN);
            out.push_str(",\"cruise_reference_ft\":");
            json::number(&mut out, flight::CRUISE_REFERENCE_FT);
            out.push('}');
            return Ok(out);
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    json::number(&mut out, figure);
    Ok(out)
}

/// Night and civil twilight (sun.rs, 14 CFR 1.1, 61.57(b)).
pub fn night(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let pair = |key: &str| -> Result<(f64, f64), String> {
        match v.get(key).and_then(Value::as_array) {
            Some([a, b]) => a.as_f64().zip(b.as_f64()).ok_or_else(|| format!("{name}: \"{key}\" is not [lat, lon]")),
            _ => Err(format!("{name}: \"{key}\" is not [lat, lon]")),
        }
    };
    let night = match name {
        "night_on_the_way" => sun::night_on_the_way(pair("start")?, pair("end")?, ask.num("depart_s")?, ask.num("minutes")?),
        "passenger_night" => sun::passenger_night(ask.num("lat")?, ask.num("lon")?, ask.num("at_s")?),
        // The sky's own day and night (sunset to sunrise), not 1.1's.
        "sun_down" => sun::sun_down(ask.num("lat")?, ask.num("lon")?, ask.num("at_s")?),
        "passenger_night_on_the_way" => {
            sun::passenger_night_on_the_way(pair("start")?, pair("end")?, ask.num("depart_s")?, ask.num("minutes")?)
        }
        _ => sun::night_at_either_end(pair("start")?, ask.num("depart_s")?, pair("end")?, ask.num("arrive_s")?),
    };
    Ok(night.to_string())
}

/// The altitudes a flight may be planned at (limits.rs: 71.33, 91.119(c),
/// 91.121, 91.159, 91.179).
pub fn altitudes(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "altitude_limits" => {
            out.push_str("{\"lowest_ft\":");
            json::number(&mut out, limits::LOWEST_FT);
            out.push_str(",\"highest_ft\":");
            json::number(&mut out, limits::highest_ft(ask.opt_bool("ifr")?));
            out.push_str(",\"class_a_floor_ft\":");
            json::number(&mut out, limits::CLASS_A_FLOOR_FT);
            out.push_str(",\"flight_levels_from_ft\":");
            json::number(&mut out, limits::FLIGHT_LEVELS_FROM_FT);
            out.push_str(",\"step_ft\":");
            json::number(&mut out, limits::STEP_FT);
            out.push('}');
        }
        "altitude_allowed" => out.push_str(&limits::allowed(ask.num("ft")?, ask.opt_bool("ifr")?).to_string()),
        "vfr_altitudes" => {
            out.push('[');
            for (i, ft) in limits::vfr_altitudes(ask.opt_num("from_ft")?.unwrap_or(1000.0)).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::number(&mut out, *ft);
            }
            out.push(']');
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// FAA Form 7233-4's items as AIM Appendix 4 writes them (filing.rs).
pub fn filed(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "filed_level" => json::string(&mut out, &filing::level(ask.num("ft")?)),
        "filed_speed" => json::string(&mut out, &filing::speed(ask.num("tas_kt")?)),
        "filed_duration" => json::string(&mut out, &filing::duration(ask.num("minutes")?)),
        "filed_wake" => json::opt_string(&mut out, filing::wake(ask.opt_num("max_takeoff_lb")?)),
        // NASR's ICAO_ID where the host has the field's row: present and
        // null or "" is "NASR lists none"; absent, the identifier decides.
        "filed_zzzz" => {
            let icao = match v.get("icao_id") {
                None => None,
                Some(Value::Null) => Some(""),
                Some(Value::String(s)) => Some(s.as_str()),
                Some(_) => return Err("filed_zzzz: \"icao_id\" is not a string".to_owned()),
            };
            out.push_str(&filing::needs_zzzz(ask.str("ident")?, icao).to_string())
        }
        // Item 19's endurance, item 18's date of flight and a T or Q route
        // (the web's lib/flightPlanForm before #482).
        "filed_endurance" => match filing::endurance_minutes(ask.num("fuel_gal")?, ask.num("burn_gph")?) {
            Some(m) => out.push_str(&m.to_string()),
            None => out.push_str("null"),
        },
        "filed_dof" => json::opt_string(&mut out, filing::date_of_flight(ask.str("depart")?, ask.str("today")?).as_deref()),
        "filed_rnav" => {
            let airways: Vec<&str> = match v.get("airways") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Array(list)) => list.iter().filter_map(Value::as_str).collect(),
                Some(_) => return Err("filed_rnav: \"airways\" is not a list of strings".to_owned()),
            };
            out.push_str(&filing::rnav_route(&airways).to_string());
        }
        _ => json::string(&mut out, &filed_route(&ask)?),
    }
    Ok(out)
}

/// Item 15's route from its stops, airways and procedures.
fn filed_route(ask: &Ask) -> Result<String, String> {
    let words = |key: &str| -> Result<Vec<&str>, String> {
        match ask.v.get(key) {
            None | Some(Value::Null) => Ok(Vec::new()),
            Some(Value::Array(list)) => {
                list.iter().map(|w| w.as_str().ok_or_else(|| format!("filed_route: \"{key}\" is not a list of strings"))).collect()
            }
            Some(_) => Err(format!("filed_route: \"{key}\" is not a list of strings")),
        }
    };
    let procedure = |key: &str| -> Result<Option<filing::Procedure>, String> {
        match ask.v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(p) => Ok(Some(filing::Procedure {
                id: p.get("id").and_then(Value::as_str).ok_or_else(|| format!("filed_route: \"{key}\" has no \"id\""))?,
                transition: p.get("transition").and_then(Value::as_str),
            })),
        }
    };
    let (stops, airways) = (words("stops")?, words("airways")?);
    let (departure, arrival) = (procedure("departure")?, procedure("arrival")?);
    Ok(filing::route(&stops, |w| airways.contains(&w), departure.as_ref(), arrival.as_ref()))
}

/// Whether a field is open, and the words a closed one is labelled with
/// (field.rs, NASR APT_BASE's ARPT_STATUS): `status` null or missing where
/// NASR has no record of the field.
pub fn field_status(name: &str, v: &Value) -> Result<String, String> {
    let code = match v.get("status") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => return Err(format!("{name}: \"status\" is not a string or null")),
    };
    let mut out = format!("{{\"open\":{},\"closed\":", field::is_open(code));
    json::opt_string(&mut out, field::closed_words(code));
    out.push('}');
    Ok(out)
}

/// `field_military`: whether a field is the armed services' own, from
/// NASR APT_BASE's OWNERSHIP_TYPE_CODE and FACILITY_USE_CODE (field.rs):
/// `{"military": "military" | "joint" | null}`.
pub fn field_military(name: &str, v: &Value) -> Result<String, String> {
    let code = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.as_str())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string or null")),
    };
    let mut out = String::from("{\"military\":");
    json::opt_string(&mut out, field::military(code("ownership")?, code("use")?));
    out.push('}');
    Ok(out)
}
