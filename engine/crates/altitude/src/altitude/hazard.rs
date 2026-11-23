//! Hazard colouring: the ground and the obstacles on the map coloured
//! against the altitude flown, or planned, as ForeFlight's Hazard Advisor
//! colours them -- red where they come within the pilot's clearance of
//! the airplane or above it, yellow within a further band, nothing above
//! that -- and the obstacles on the profile against the plan.
//!
//! The clearance is the pilot's pick of three, each a minimum of 14 CFR
//! Part 91's, so a red is "closer than the rule this pilot flies by":
//!
//! - 500 ft: 91.119(c), over other than congested areas, "An altitude
//!   of 500 feet above the surface, except over open water or sparsely
//!   populated areas. In those cases, the aircraft may not be operated
//!   closer than 500 feet to any person, vessel, vehicle, or structure."
//!   Two rules, the second for open water and sparse country; the map,
//!   which knows neither, holds 500 ft against the ground and the
//!   obstacles (structures) alike;
//! - 1,000 ft, the default: 91.119(b), "1,000 feet above the highest
//!   obstacle within a horizontal radius of 2,000 feet" over a congested
//!   area, and 91.177(a)(2)(ii)'s IFR "1,000 feet above the highest
//!   obstacle within a horizontal distance of 4 nautical miles"; the map
//!   does not know the town or the rules flown, so the stricter of the
//!   VFR two and IFR's own;
//! - 2,000 ft: 91.177(a)(2)(i), "2,000 feet above the highest obstacle"
//!   over a mountainous area Part 95 designates.
//!
//! The yellow band is a further 1,000 ft under the red: a caution, ground
//! coming up towards the red, as ForeFlight's yellow is its 1,000 ft (its
//! Pilot's Guide, Hazard Advisor). Exactly the clearance meets the rule
//! and is yellow, as the profile's 500 ft is (clearance.rs).
//!
//! It is a picture of the ground against one altitude, not terrain
//! clearance: no TAWS (TSO-C151), no look ahead, and the legal floors are
//! 91.119 and 91.177's, which the plan's altitudes keep (floor.rs).
//!
//! Which altitude: the GPS's in flight, the plan's cruise on the ground.
//! In flight is the engine's own "underway" (flying speed, the glide
//! ring's and the debrief's). The web's height is the Geolocation API's,
//! over the WGS84 ellipsoid, not sea level; over the United States the
//! geoid lies some 30 m (about 100 ft) under the ellipsoid (NOAA's
//! GEOID18), so the height read is lower than the airplane's true
//! altitude and the colours err red, the safer side. The iPhone and
//! Android apps send the platform's own height over mean sea level (the
//! owner's pick, 2026-11-21), so this applies to the web alone. Either is
//! taken as it comes.

use super::calls::{list, num, obj, opt_num, written, R};
use super::clearance::{RED_WITHIN_FT, YELLOW_WITHIN_FT};
use crate::figures::glide::underway;
use crate::json::Value;
use wingtip_core::sort::StableSort;

/// The pilot's clearances to pick from, ft: 91.119(c), 91.119(b) and
/// 91.177(a)(2)(ii), 91.177(a)(2)(i).
pub const CLEARANCES_FT: [f64; 3] = [500.0, 1000.0, 2000.0];
/// The clearance with none picked: 91.119(b)'s and 91.177(a)(2)(ii)'s.
pub const DEFAULT_CLEARANCE_FT: f64 = 1000.0;
/// The yellow band under the red, ft.
pub const CAUTION_BAND_FT: f64 = 1000.0;

/// The map's setting: never, always, or by itself in flight.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Setting {
    Off,
    On,
    InFlight,
}

/// What the map draws: the altitude, where it is from, and the bands.
#[derive(Clone, Debug, PartialEq)]
pub struct View {
    pub shown: bool,
    pub in_flight: bool,
    pub altitude_ft: Option<f64>,
    pub source: Option<&'static str>,
    pub clearance_ft: f64,
    /// Ground or an obstacle over this is red, ft MSL.
    pub warning_from_ft: Option<f64>,
    /// And over this, yellow.
    pub caution_from_ft: Option<f64>,
}

/// The clearance picked, or the default for none or one not offered.
pub fn clearance(picked: Option<f64>) -> f64 {
    picked.filter(|ft| CLEARANCES_FT.contains(ft)).unwrap_or(DEFAULT_CLEARANCE_FT)
}

/// The view for `setting`, the GPS's ground speed and height, and the plan's cruise.
pub fn view(setting: Setting, speed_kt: Option<f64>, gps_ft: Option<f64>, planned_ft: Option<f64>, picked: Option<f64>) -> View {
    let in_flight = underway(speed_kt);
    let (altitude_ft, source) = match (in_flight, gps_ft, planned_ft) {
        (true, Some(ft), _) => (Some(ft), Some("gps")),
        (_, _, Some(ft)) => (Some(ft), Some("plan")),
        _ => (None, None),
    };
    let wanted = match setting {
        Setting::Off => false,
        Setting::On => true,
        Setting::InFlight => in_flight,
    };
    let clearance_ft = clearance(picked);
    let warning = altitude_ft.map(|a| a - clearance_ft);
    View {
        shown: wanted && altitude_ft.is_some(),
        in_flight,
        altitude_ft,
        source,
        clearance_ft,
        warning_from_ft: warning,
        caution_from_ft: warning.map(|w| w - CAUTION_BAND_FT),
    }
}

/// A height against a red and a yellow line: "warning" over the red,
/// "caution" at or over the yellow, else "clear". Exactly at the red is
/// the clearance kept, so yellow.
pub fn level(top_ft: f64, warning_from_ft: f64, caution_from_ft: f64) -> &'static str {
    if top_ft > warning_from_ft {
        "warning"
    } else if top_ft >= caution_from_ft {
        "caution"
    } else {
        "clear"
    }
}

fn setting(name: &str, v: &Value) -> R<Setting> {
    match v.get("setting").and_then(Value::as_str) {
        Some("off") | None => Ok(Setting::Off),
        Some("on") => Ok(Setting::On),
        Some("flight") => Ok(Setting::InFlight),
        Some(other) => Err(format!("{name}: \"setting\" {other:?} is not off, on or flight")),
    }
}

fn opt(x: Option<f64>) -> Value {
    x.map_or(Value::Null, Value::Number)
}

/// `hazard_view`: the map's colours, and each of `tops_ft` against them.
pub fn hazard_view(name: &str, v: &Value) -> R<String> {
    let view = view(
        setting(name, v)?,
        opt_num(name, v, "speed_kt")?,
        opt_num(name, v, "gps_altitude_ft")?,
        opt_num(name, v, "planned_altitude_ft")?,
        opt_num(name, v, "clearance_ft")?,
    );
    let levels = list(name, v, "tops_ft")?
        .iter()
        .map(|t| {
            let top = t.as_f64().ok_or_else(|| format!("{name}: \"tops_ft\" holds a non-number"))?;
            Ok(match (view.warning_from_ft, view.caution_from_ft) {
                (Some(w), Some(c)) => Value::String(level(top, w, c).to_owned()),
                _ => Value::Null,
            })
        })
        .collect::<R<Vec<_>>>()?;
    Ok(written(&obj(vec![
        ("shown", Value::Bool(view.shown)),
        ("in_flight", Value::Bool(view.in_flight)),
        ("altitude_ft", opt(view.altitude_ft)),
        ("source", view.source.map_or(Value::Null, |s| Value::String(s.to_owned()))),
        ("clearance_ft", Value::Number(view.clearance_ft)),
        ("caution_band_ft", Value::Number(CAUTION_BAND_FT)),
        ("clearances_ft", Value::Array(CLEARANCES_FT.iter().copied().map(Value::Number).collect())),
        ("warning_from_ft", opt(view.warning_from_ft)),
        ("caution_from_ft", opt(view.caution_from_ft)),
        ("levels", Value::Array(levels)),
    ])))
}

/// How many obstacles the profile names, the tallest: more is a row of
/// words over a phone's 340 points.
pub const PROFILE_NAMED: usize = 3;
/// How far apart along the route two named ones are, as a share of it:
/// a tower farm is one name, not three on top of one another.
const NAMED_APART: f64 = 0.12;

/// `profile_obstacles`: the DOF's obstacles along the route against the
/// profile's altitude, coloured as its ground is (clearance.rs: red under
/// 91.119(c)'s 500 ft or above, yellow within 91.119(b)'s 1,000), and
/// the tallest few, apart, to name with their heights above the ground
/// and the sea (DOF's AGL and AMSL, feet).
pub fn profile_obstacles(name: &str, v: &Value) -> R<String> {
    let altitude = opt_num(name, v, "altitude_ft")?;
    let length = num(name, v, "length_nm")?;
    let mut found = list(name, v, "obstacles")?
        .iter()
        .map(|o| Ok((num(name, o, "along_nm")?, num(name, o, "amsl_ft")?, opt_num(name, o, "agl_ft")?)))
        .collect::<R<Vec<_>>>()?;
    found.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut tallest: Vec<usize> = (0..found.len()).collect();
    tallest.stable_sort_by(|&a, &b| found[b].1.total_cmp(&found[a].1));
    let mut named: Vec<usize> = Vec::new();
    for i in tallest {
        if named.len() == PROFILE_NAMED {
            break;
        }
        if named.iter().all(|&j| (found[i].0 - found[j].0).abs() > NAMED_APART * length) {
            named.push(i);
        }
    }
    let out = found
        .iter()
        .enumerate()
        .map(|(i, &(along, amsl, agl))| {
            let lvl = altitude.map(|a| level(amsl, a - RED_WITHIN_FT, a - YELLOW_WITHIN_FT));
            obj(vec![
                ("along_nm", Value::Number(along)),
                ("amsl_ft", Value::Number(amsl)),
                ("agl_ft", opt(agl)),
                ("level", lvl.map_or(Value::Null, |l| Value::String(l.to_owned()))),
                ("named", Value::Bool(named.contains(&i))),
            ])
        })
        .collect();
    Ok(written(&Value::Array(out)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn red_within_the_clearance_yellow_a_thousand_under_it() {
        // 5,500 ft, the default 1,000 (91.119(b)): red over 4,500, yellow from 3,500.
        let v = view(Setting::On, None, None, Some(5500.0), None);
        assert_eq!((v.warning_from_ft, v.caution_from_ft), (Some(4500.0), Some(3500.0)));
        assert_eq!(v.source, Some("plan"));
        assert_eq!(level(4501.0, 4500.0, 3500.0), "warning");
        // Exactly 1,000 ft under meets 91.119(b): yellow, not red.
        assert_eq!(level(4500.0, 4500.0, 3500.0), "caution");
        assert_eq!(level(3500.0, 4500.0, 3500.0), "caution");
        assert_eq!(level(3499.0, 4500.0, 3500.0), "clear");
        // Over the airplane is red.
        assert_eq!(level(6000.0, 4500.0, 3500.0), "warning");
    }

    #[test]
    fn the_pilots_clearance_of_three_and_the_default_for_any_other() {
        assert_eq!(clearance(Some(500.0)), 500.0);
        assert_eq!(clearance(Some(2000.0)), 2000.0);
        assert_eq!(clearance(Some(750.0)), DEFAULT_CLEARANCE_FT);
        assert_eq!(clearance(None), 1000.0);
        let v = view(Setting::On, None, None, Some(8500.0), Some(2000.0));
        assert_eq!((v.warning_from_ft, v.caution_from_ft), (Some(6500.0), Some(5500.0)));
    }

    #[test]
    fn gps_height_in_flight_the_plan_on_the_ground() {
        let v = view(Setting::On, Some(110.0), Some(4300.0), Some(5500.0), None);
        assert_eq!((v.in_flight, v.altitude_ft, v.source), (true, Some(4300.0), Some("gps")));
        let v = view(Setting::On, Some(5.0), Some(900.0), Some(5500.0), None);
        assert_eq!((v.in_flight, v.altitude_ft, v.source), (false, Some(5500.0), Some("plan")));
        // In flight with no GPS height: the plan's.
        assert_eq!(view(Setting::On, Some(110.0), None, Some(5500.0), None).source, Some("plan"));
        assert!(!view(Setting::On, None, None, None, None).shown);
    }

    #[test]
    fn in_flight_turns_it_on_by_itself_off_never() {
        assert!(!view(Setting::InFlight, Some(5.0), None, Some(5500.0), None).shown);
        assert!(view(Setting::InFlight, Some(110.0), Some(4300.0), Some(5500.0), None).shown);
        assert!(!view(Setting::Off, Some(110.0), Some(4300.0), Some(5500.0), None).shown);
    }
}
