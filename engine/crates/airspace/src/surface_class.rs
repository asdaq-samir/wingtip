//! The class of the airspace at a field's surface, for the airport card's
//! Airspace fact (the owner, 2026-11-14: "the info strip can have these
//! fixed things: weather, airspace, elevation, pattern altitude and
//! distance"), from the NASR Class Airspace volumes whose shape holds the
//! field (wingtip.airspace_at volumes_at, or a phone's cycle pack).
//!
//! - Only a volume from the surface counts: a Class B or C shelf over the
//!   field, its floor an altitude above the ground, is not the class the
//!   field is in (AIM 3-2-3: a Class B "consists of a surface area and two
//!   or more layers"; AIM 3-2-4: a Class C's "shelf area that extends no
//!   lower than 1,200 feet").
//! - B, C, D and E: Class B, C and D are designated in 14 CFR 71.41, 71.51
//!   and 71.61, Class E for an airport in 71.71(b): a Class E surface
//!   area (NASR's CLASS_E2) "extend[s] upward from the surface" and the
//!   extensions to one (E3, E4) "begin at the surface" (AIM 3-2-6e1 and
//!   e2). Where they overlap the most restrictive holds,
//!   B before C before D before E.
//! - G where no volume reaches the surface: the airspace not designated
//!   B, C, D or E is uncontrolled (AIM 3-3-1).
//! - Part-time: NASR's WKHR_CODE says when a volume is in effect: "H24"
//!   all the time; "NOTAM" (its legal description "references NOTAM",
//!   JO 7400.11's "effective during the specific dates and times
//!   established in advance by a Notice to Air Missions") and "RMK" (its
//!   times in a remark) part of it. "Where a Class D surface area is
//!   part-time, the airspace may revert to either a Class E surface area
//!   ... or Class G airspace" (AIM 3-2-5a1; the Chart Supplement's "other
//!   times CLASS E" or "other times CLASS G"): the next class reaching the
//!   surface is what holds then, else G. A volume with no code is read as
//!   full-time, the safer reading (the pilot is told to call the tower).

use crate::json::{self, Value};
use wingtip_core::ask::Ask;

/// The field's surface class and, where it is part-time, what it is at
/// other times: `otherwise` the next class reaching the surface ('G' where
/// none does), `otherwise_part_time` whether that one is part-time too.
#[derive(Debug, PartialEq)]
pub struct SurfaceClass {
    pub class: char,
    pub part_time: bool,
    pub otherwise: Option<char>,
    pub otherwise_part_time: bool,
}

/// One NASR Class Airspace volume as the planner sends it: its class, its
/// floor (feet over SFC, AGL or MSL, as wingtip.airspace_at `_floor`) and
/// its WKHR_CODE.
pub struct Surface<'a> {
    pub class: char,
    pub floor_ft: f64,
    pub floor_ref: &'a str,
    pub hours: &'a str,
}

/// Whether a volume reaches the ground at a field `elevation_ft` high: a
/// floor at the surface, 0 ft above it, or an MSL floor at or under the
/// field (where the elevation is known).
fn reaches_surface(s: &Surface, elevation_ft: Option<f64>) -> bool {
    match s.floor_ref {
        r if r.eq_ignore_ascii_case("SFC") => true,
        r if r.eq_ignore_ascii_case("AGL") => s.floor_ft <= 0.0,
        _ => elevation_ft.is_some_and(|e| s.floor_ft <= e),
    }
}

/// Part-time where NASR says its times are by NOTAM or in a remark.
fn part_time(hours: &str) -> bool {
    let h = hours.trim();
    h.eq_ignore_ascii_case("NOTAM") || h.eq_ignore_ascii_case("RMK")
}

/// The surface class at a field from the volumes holding it.
pub fn surface_class(elevation_ft: Option<f64>, volumes: &[Surface]) -> SurfaceClass {
    // Each class reaching the surface, most restrictive first, part-time
    // only where every one of its volumes is.
    let mut classes: Vec<(char, bool)> = Vec::new();
    for class in ['B', 'C', 'D', 'E'] {
        let here: Vec<&Surface> = volumes.iter().filter(|s| s.class == class && reaches_surface(s, elevation_ft)).collect();
        if !here.is_empty() {
            classes.push((class, here.iter().all(|s| part_time(s.hours))));
        }
    }
    match classes.as_slice() {
        [] => SurfaceClass { class: 'G', part_time: false, otherwise: None, otherwise_part_time: false },
        [(class, false), ..] => SurfaceClass { class: *class, part_time: false, otherwise: None, otherwise_part_time: false },
        [(class, true), rest @ ..] => {
            let (otherwise, otherwise_part_time) = rest.first().copied().unwrap_or(('G', false));
            SurfaceClass { class: *class, part_time: true, otherwise: Some(otherwise), otherwise_part_time }
        }
    }
}

/// `surface_airspace`: `{elevation_ft?, volumes: [{class, floor_ft,
/// floor_ref, hours?}]}` to `{class, part_time, otherwise,
/// otherwise_part_time}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut volumes = Vec::new();
    for o in ask.list("volumes")? {
        let item = Ask::new(name, o);
        let class = item.str("class")?.trim();
        let class = match class {
            "B" | "C" | "D" | "E" => class.chars().next().unwrap_or('G'),
            _ => return Err(format!("{name}: a volume's class is B, C, D or E, not {class:?}")),
        };
        volumes.push(Surface {
            class,
            floor_ft: item.opt_num("floor_ft")?.unwrap_or(0.0),
            floor_ref: item.str("floor_ref")?,
            hours: item.opt_str("hours")?,
        });
    }
    let s = surface_class(ask.opt_num("elevation_ft")?, &volumes);
    let mut out = String::from("{\"class\":");
    json::string(&mut out, &s.class.to_string());
    out.push_str(&format!(",\"part_time\":{},\"otherwise\":", s.part_time));
    match s.otherwise {
        Some(c) => json::string(&mut out, &c.to_string()),
        None => out.push_str("null"),
    }
    out.push_str(&format!(",\"otherwise_part_time\":{}}}", s.otherwise_part_time));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vol(class: char, floor_ft: f64, floor_ref: &'static str, hours: &'static str) -> Surface<'static> {
        Surface { class, floor_ft, floor_ref, hours }
    }

    #[test]
    fn a_class_b_surface_area_under_its_own_shelves_is_b() {
        // KORD: the Chicago Class B from the surface, its shelves above.
        let v = [vol('B', 0.0, "SFC", "H24"), vol('B', 1_900.0, "MSL", "H24")];
        assert_eq!(
            surface_class(Some(680.0), &v),
            SurfaceClass { class: 'B', part_time: false, otherwise: None, otherwise_part_time: false }
        );
    }

    #[test]
    fn a_shelf_over_the_field_is_not_its_surface_class() {
        // Under a Class C shelf from 1,200 MSL and a 700 ft AGL Class E: G.
        let v = [vol('C', 1_200.0, "MSL", "H24"), vol('E', 700.0, "AGL", "H24")];
        assert_eq!(surface_class(Some(600.0), &v).class, 'G');
        // A floor at or under the field, as MSL, reaches it; one a foot over does not.
        assert_eq!(surface_class(Some(1_200.0), &v).class, 'C');
        assert_eq!(surface_class(Some(1_199.0), &v).class, 'G');
        assert_eq!(surface_class(None, &v).class, 'G');
    }

    #[test]
    fn the_most_restrictive_holds() {
        let v = [vol('E', 0.0, "SFC", "H24"), vol('D', 0.0, "SFC", "H24"), vol('C', 0.0, "SFC", "H24")];
        assert_eq!(surface_class(Some(10.0), &v).class, 'C');
    }

    #[test]
    fn a_part_time_d_says_what_it_is_at_other_times() {
        // AIM 3-2-5a1: "other times CLASS E" or "other times CLASS G".
        let e = [vol('D', 0.0, "SFC", "NOTAM"), vol('E', 0.0, "SFC", "H24")];
        assert_eq!(
            surface_class(Some(800.0), &e),
            SurfaceClass { class: 'D', part_time: true, otherwise: Some('E'), otherwise_part_time: false }
        );
        let g = [vol('D', 0.0, "SFC", "NOTAM")];
        assert_eq!(
            surface_class(Some(800.0), &g),
            SurfaceClass { class: 'D', part_time: true, otherwise: Some('G'), otherwise_part_time: false }
        );
        let both = [vol('D', 0.0, "SFC", "RMK"), vol('E', 0.0, "SFC", "NOTAM")];
        assert!(surface_class(Some(800.0), &both).otherwise_part_time);
    }

    #[test]
    fn full_time_where_any_volume_of_the_class_is_or_no_code_is_given() {
        let v = [vol('D', 0.0, "SFC", "NOTAM"), vol('D', 0.0, "SFC", "H24")];
        assert!(!surface_class(Some(0.0), &v).part_time);
        assert!(!surface_class(Some(0.0), &[vol('D', 0.0, "SFC", "")]).part_time);
    }

    #[test]
    fn the_rule_answers_its_contract() {
        let v = json::parse(r#"{"elevation_ft":800,"volumes":[{"class":"D","floor_ft":0,"floor_ref":"SFC","hours":"NOTAM"}]}"#).unwrap();
        assert_eq!(call("surface_airspace", &v).unwrap(), r#"{"class":"D","part_time":true,"otherwise":"G","otherwise_part_time":false}"#);
        assert_eq!(
            call("surface_airspace", &json::parse(r#"{"volumes":[]}"#).unwrap()).unwrap(),
            r#"{"class":"G","part_time":false,"otherwise":null,"otherwise_part_time":false}"#
        );
        assert!(call("surface_airspace", &json::parse(r#"{"volumes":[{"class":"A","floor_ref":"SFC"}]}"#).unwrap()).is_err());
    }
}
