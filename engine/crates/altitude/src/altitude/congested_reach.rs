//! How far round a point the planner looks for towns before the engine
//! measures it against them (`congested_reach`): the planner finds each
//! point's candidate towns by their boxes in a tree of degrees
//! (wingtip.congested), then asks `congested_points` (congested.rs) to
//! hold each point to 14 CFR 91.119(b)'s "horizontal radius of 2,000 feet
//! of the aircraft".
//!
//! The search reaches a quarter further than that radius, 2,500 ft, so a
//! town at the radius's edge is always among the candidates: the boxes are
//! measured in degrees and a degree of latitude is taken as sixty nautical
//! miles (congested.rs's FT_PER_DEG_LAT), which the earth's flattening
//! moves by under 1%. A wider search only measures more towns; a narrower
//! one would miss a town the rule counts, so the margin errs toward
//! calling a point congested.
//!
//! In degrees, never short in any direction: a degree of longitude is
//! shorter than one of latitude by the latitude's cosine, so the reach is
//! divided by the cosine of the farthest latitude asked (held to 0.2 and
//! over, and the latitude to 89 degrees, as the planner's grids hold
//! them near the poles).

use super::congested::{FT_PER_DEG_LAT, RADIUS_FT};
use crate::json::{self, Value};
use wingtip_core::ask::Ask;

/// The search's reach, ft: 91.119(b)'s 2,000 ft and a quarter over.
pub const SEARCH_FT: f64 = RADIUS_FT * 1.25;

/// The reach in degrees round points no farther from the equator than
/// `lat` (degrees, either sign).
pub fn reach_deg(lat: f64) -> f64 {
    let widest = lat.abs().min(89.0).to_radians().cos().max(0.2);
    SEARCH_FT / FT_PER_DEG_LAT / widest
}

/// `congested_reach`: `{"lat"}` (the farthest latitude asked, degrees)
/// to `{"search_ft", "reach_deg"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let lat = Ask::new(name, v).num("lat")?;
    if !lat.is_finite() {
        return Err(format!("{name}: \"lat\" is not a number"));
    }
    let mut out = String::from("{\"search_ft\":");
    json::number(&mut out, SEARCH_FT);
    out.push_str(",\"reach_deg\":");
    json::number(&mut out, reach_deg(lat));
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_search_reaches_past_the_rules_two_thousand_feet() {
        // 91.119(b)'s radius is 2,000 ft; the search reaches a quarter past it.
        assert_eq!(SEARCH_FT, 2500.0);
        // At the equator a degree of latitude is 60 nm.
        let at_equator = reach_deg(0.0) * FT_PER_DEG_LAT;
        assert!((at_equator - 2500.0).abs() < 1e-9);
        // At 60 N a degree of longitude is half one of latitude: twice the degrees.
        assert!((reach_deg(60.0) / reach_deg(0.0) - 2.0).abs() < 1e-9);
        assert_eq!(reach_deg(-60.0), reach_deg(60.0));
        // Near the pole the cosine is held to 0.2.
        assert!((reach_deg(89.5) / reach_deg(0.0) - 5.0).abs() < 1e-9);
    }

    #[test]
    fn the_call_answers_in_its_shape() {
        let v = json::parse(r#"{"lat":0}"#).unwrap();
        let out = call("congested_reach", &v).unwrap();
        assert!(out.starts_with(r#"{"search_ft":2500.0,"reach_deg":0.0068"#), "{out}");
        assert!(call("congested_reach", &json::parse("{}").unwrap()).is_err());
    }
}
