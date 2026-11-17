//! The hours ahead a search's "VFR at…" menu offers: the fields whose TAF
//! forecasts VFR that many hours from now. Each is within the 24 hours a
//! TAF covers (FAA-H-8083-28B 27.4.1, `hours::HOURS`), so every field with
//! a TAF has a forecast for it; the steps themselves are the app's choice,
//! close together for the next few hours and wider after. What the TAF
//! then says is the engine's (forecast_hour).

use super::hours::HOURS;
use crate::json;

/// The hours offered, in order.
pub const VFR_AT_HOURS: [usize; 5] = [1, 2, 3, 6, 12];

// Every step within a TAF's 24 hours (FAA-H-8083-28B 27.4.1).
const _: () = assert!(VFR_AT_HOURS[VFR_AT_HOURS.len() - 1] <= HOURS);

/// `vfr_at_hours`: the list, from `{}`.
pub fn call(_name: &str, _v: &json::Value) -> Result<String, String> {
    let mut out = String::from("[");
    for (i, h) in VFR_AT_HOURS.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::number(&mut out, *h as f64);
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_steps_are_in_order() {
        assert!(super::VFR_AT_HOURS.windows(2).all(|w| w[0] < w[1]));
    }
}
