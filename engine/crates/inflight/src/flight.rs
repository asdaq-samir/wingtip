//! The planned flight as the in-flight copilot starts from (the web's
//! useCopilotPublish asked this rather than working it out): the fuel
//! aboard at takeoff, the plan's ground speed and whether anyone but the
//! pilot is aboard, each from the plan and the airplane's load.

use crate::input::R;
use wingtip_core::ask::{opt_num_in, Ask};
use wingtip_core::json::{self, Value};
use wingtip_flight::flight::average_groundspeed_kt;

/// A station of the airplane's load, by its handbook name, and the
/// weight in it.
pub struct Station<'a> {
    pub name: &'a str,
    pub lb: f64,
}

/// Whether anyone but the pilot is aboard, for 61.57(a) and (b)'s
/// passenger currency (checks::night_passengers): a station other than
/// the pilot's, the baggage's or the cargo's with weight in it. The
/// pilot's own station, which handbooks name "Pilot and front passenger",
/// is not counted, so a front-seat passenger alone is not seen: the
/// copilot then says less, never something untrue.
pub fn passengers(stations: &[Station]) -> bool {
    stations.iter().any(|s| {
        let name = s.name.to_ascii_lowercase();
        !["pilot", "baggage", "cargo"].iter().any(|k| name.contains(k)) && s.lb > 0.0
    })
}

/// The fuel at takeoff: the fuel aboard at the start less the taxi's
/// (the profile's taxi allowance, which the nav log counts before the
/// first leg), never below none.
pub fn fuel_at_takeoff(start_gal: f64, taxi_gal: Option<f64>) -> f64 {
    (start_gal - taxi_gal.unwrap_or(0.0)).max(0.0)
}

/// `copilot_flight` by name.
pub fn rule(name: &str, v: &Value) -> R<String> {
    let ask = Ask::new(name, v);
    let stations = match v.get("stations") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(list)) => list
            .iter()
            .map(|s| {
                let station = s.get("name").and_then(Value::as_str).ok_or_else(|| format!("{name}: a station has no \"name\""))?;
                Ok(Station { name: station, lb: opt_num_in(name, s, "lb")?.unwrap_or(0.0) })
            })
            .collect::<R<Vec<_>>>()?,
        Some(_) => return Err(format!("{name}: \"stations\" is not a list")),
    };
    let speed = ask.opt_num("distance_nm")?.zip(ask.opt_num("ete_min")?).map(|(nm, min)| average_groundspeed_kt(nm, min));
    let taxi = ask.opt_num("taxi_gal")?;
    let mut out = String::from("{\"fuel_gal\":");
    json::opt_number(&mut out, ask.opt_num("fuel_gal")?.map(|f| fuel_at_takeoff(f, taxi)));
    out.push_str(",\"planned_gs_kt\":");
    json::opt_number(&mut out, speed);
    out.push_str(&format!(",\"passengers\":{}}}", passengers(&stations)));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passengers_are_weight_in_a_seat_not_the_pilots() {
        let s = |name, lb| Station { name, lb };
        assert!(!passengers(&[s("Pilot and front passenger", 340.0), s("Baggage area 1", 40.0)]));
        assert!(passengers(&[s("Pilot and front passenger", 170.0), s("Rear passengers", 150.0)]));
        assert!(!passengers(&[s("Rear passengers", 0.0)]));
        assert_eq!(fuel_at_takeoff(40.0, Some(1.4)), 38.6);
        assert_eq!(fuel_at_takeoff(1.0, Some(1.4)), 0.0);
    }
}
