//! geo.rs's figures by name, as the facade's dispatcher asks them
//! (contract/*.json, `wingtip_core::geo::call`).

use super::*;

fn num(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is missing or not a number"))
}

/// The geodesic figures by name, for the apps that draw between fixes (the
/// phones' traffic notice, own trail and replay) and the planner, so no app
/// keeps its own great-circle arithmetic: `distance_nm` and `bearing_deg`
/// from `{"lat1", "lon1", "lat2", "lon2"}`, and `destination` from
/// `{"points": [{"lat", "lon", "bearing_deg", "nm"}]}` to `[{"lat",
/// "lon"}]`, a list so a map's airplanes carried on a step a second cross
/// into the engine once, not once each; `velocity_track` from
/// `{"velocities": [{"east", "north"}]}` to `[{"track_deg", "speed"}]`,
/// a list for the same reason.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    match name {
        "distance_nm" | "bearing_deg" => {
            let (lat1, lon1, lat2, lon2) = (num(name, v, "lat1")?, num(name, v, "lon1")?, num(name, v, "lat2")?, num(name, v, "lon2")?);
            let figure = if name == "distance_nm" { distance_nm(lat1, lon1, lat2, lon2) } else { bearing_deg(lat1, lon1, lat2, lon2) };
            json::number(&mut out, figure);
        }
        "destination" => {
            let points = v.get("points").and_then(Value::as_array).ok_or("destination: \"points\" is missing or not a list")?;
            out.push('[');
            for (i, p) in points.iter().enumerate() {
                let (lat, lon) = destination(num(name, p, "lat")?, num(name, p, "lon")?, num(name, p, "bearing_deg")?, num(name, p, "nm")?);
                out.push_str(if i > 0 { ",{\"lat\":" } else { "{\"lat\":" });
                json::number(&mut out, lat);
                out.push_str(",\"lon\":");
                json::number(&mut out, lon);
                out.push('}');
            }
            out.push(']');
        }
        "velocity_track" => {
            let parts = v.get("velocities").and_then(Value::as_array).ok_or("velocity_track: \"velocities\" is missing or not a list")?;
            out.push('[');
            for (i, p) in parts.iter().enumerate() {
                let (track, speed) = velocity_track(num(name, p, "east")?, num(name, p, "north")?);
                out.push_str(if i > 0 { ",{\"track_deg\":" } else { "{\"track_deg\":" });
                json::opt_number(&mut out, track);
                out.push_str(",\"speed\":");
                json::number(&mut out, speed);
                out.push('}');
            }
            out.push(']');
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

