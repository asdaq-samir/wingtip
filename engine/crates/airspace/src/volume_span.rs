//! How high a map stands an airspace volume in 3D: its floor and top in
//! feet MSL, from the limits as the FAA's data gives them, over the ground
//! under it where a limit is above the ground. The one copy of it: the
//! web's 3D view (features/plan/map/terrain/airspaceVolumes) asks it by
//! name (`airspace_volume_span`), and the phones' 3D views are to.
//!
//! The limits are read as the special-use tab reads them (sua_tab
//! `limit`, the one reading of the FAA's codes and descriptors): SFC with
//! a figure above 0 is that height above the ground, a ceiling "to but not
//! including" a foot under its figure and a floor "above but not
//! including" a foot over it, FL180 TNI 17,999 ft MSL, UNLTD no ceiling.
//! The same reading serves the NASR Class Airspace volumes the planner
//! sends (their floor already SFC, AGL or MSL, wingtip.airspace_at
//! `_floor`, their ceiling MSL) and the TFRs (MSL, AGL or SFC, tfr_read).
//!
//! Then, for the picture:
//!
//! - A height above the ground stands on the ground under the volume: a
//!   floor on its lowest, a ceiling on its highest, so a volume drawn flat
//!   over hills is never drawn smaller than it is. With no ground given,
//!   such a volume is not drawn (None), and the app asks again once its
//!   terrain is in.
//! - The surface is answered as 0 ft MSL, `surface` true: drawn from the
//!   sea up, the 3D ground hides what is under it, where the ground's own
//!   height would leave a gap over a valley.
//! - A flight level is drawn as if MSL (its pressure altitude), and no
//!   ceiling, or one above it, is drawn to CLASS_A_FLOOR_FT, where Class A
//!   begins ("from 18,000 feet MSL", 14 CFR 71.33(a)), the top of the
//!   airspace a VFR pilot flies in. A drawing bound, not a rule: the card
//!   writes the FAA's own figure, FL450 or unlimited.
//! - A floor with no figure is the surface, which draws the volume the
//!   larger, never the smaller.

use crate::json::{self, Value};
use crate::rules::CLASS_A_FLOOR_FT;
use crate::sua_tab::{limit, read_limit, Limit};

/// The ground under a volume, ft MSL: its lowest and its highest.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ground {
    pub low_ft: f64,
    pub high_ft: f64,
}

/// A volume as drawn: floor and top, ft MSL, and whether the floor is the
/// surface (drawn from the sea up, no rim along it).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Span {
    pub floor_ft: f64,
    pub ceiling_ft: f64,
    pub surface: bool,
}

/// The volume's span (module note), or None where nothing is left to draw
/// (the floor at or over the top) or a limit above the ground has no
/// ground to stand on.
pub fn span(floor: Limit, ceiling: Limit, ground: Option<Ground>) -> Option<Span> {
    let (floor_ft, floor_ref) = limit(floor, false);
    let (floor_ft, surface) = match (floor_ft, floor_ref) {
        (_, Some("UNL")) => return None,
        (Some(ft), Some("AGL")) => (ground?.low_ft + ft, false),
        (Some(ft), Some("MSL" | "FL")) => (ft, false),
        // SFC, or no figure: the surface.
        _ => (0.0, true),
    };
    let ceiling_ft = match limit(ceiling, true) {
        (Some(ft), Some("AGL")) => ground?.high_ft + ft,
        (Some(ft), _) => ft,
        // UNLTD, or no figure: unlimited, drawn to Class A's floor.
        (None, _) => CLASS_A_FLOOR_FT,
    }
    .min(CLASS_A_FLOOR_FT);
    (ceiling_ft > floor_ft).then_some(Span { floor_ft, ceiling_ft, surface })
}

/// `airspace_volume_span`: `{"floor": {"ft", "code", "desc"}, "ceiling":
/// {...}, "ground"?: {"low_ft", "high_ft"}}` to `{"floor_ft",
/// "ceiling_ft", "surface"}`, or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ground = match v.get("ground") {
        None | Some(Value::Null) => None,
        Some(g) => {
            let at = |key: &str| {
                g.get(key)
                    .and_then(Value::as_f64)
                    .filter(|f| f.is_finite())
                    .ok_or_else(|| format!("{name}: ground's \"{key}\" is not a number"))
            };
            Some(Ground { low_ft: at("low_ft")?, high_ft: at("high_ft")? })
        }
    };
    Ok(match span(read_limit(v, "floor"), read_limit(v, "ceiling"), ground) {
        None => "null".to_owned(),
        Some(s) => {
            let mut o = String::from("{\"floor_ft\":");
            json::number(&mut o, s.floor_ft);
            o.push_str(",\"ceiling_ft\":");
            json::number(&mut o, s.ceiling_ft);
            o.push_str(if s.surface { ",\"surface\":true}" } else { ",\"surface\":false}" });
            o
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lim<'a>(ft: Option<f64>, code: &'a str, desc: Option<&'a str>) -> Limit<'a> {
        Limit { ft, code: Some(code), desc }
    }
    const HILLS: Option<Ground> = Some(Ground { low_ft: 1_200.0, high_ft: 1_900.0 });

    #[test]
    fn a_class_d_from_the_surface_to_its_msl_top() {
        let s = span(lim(Some(0.0), "SFC", None), lim(Some(2_500.0), "MSL", None), None).unwrap();
        assert_eq!(s, Span { floor_ft: 0.0, ceiling_ft: 2_500.0, surface: true });
    }

    #[test]
    fn above_the_ground_stands_on_the_ground_and_waits_for_it() {
        // Brady Low MOA, 500 FT SFC to 6,000 MSL TNI (ADDS, 2026-11-12).
        let (floor, ceiling) = (lim(Some(500.0), "SFC", None), lim(Some(6_000.0), "MSL", Some("TNI")));
        assert_eq!(span(floor, ceiling, None), None);
        assert_eq!(span(floor, ceiling, HILLS), Some(Span { floor_ft: 1_700.0, ceiling_ft: 5_999.0, surface: false }));
        // Its pieces above but not including 1,500 AGL: CIFP's "01501A".
        assert_eq!(span(lim(Some(1_500.0), "SFC", Some("ANI")), ceiling, HILLS).unwrap().floor_ft, 2_701.0);
        // A TFR's AGL ceiling stands on the highest ground under it.
        assert_eq!(span(lim(Some(0.0), "SFC", None), lim(Some(3_000.0), "AGL", None), HILLS).unwrap().ceiling_ft, 4_900.0);
    }

    #[test]
    fn unlimited_and_high_tops_are_drawn_to_class_a() {
        // 14 CFR 71.33(a): Class A "from 18,000 feet MSL".
        let unl = span(lim(Some(3_600.0), "MSL", None), lim(None, "UNLTD", None), None).unwrap();
        assert_eq!(unl.ceiling_ft, 18_000.0);
        assert_eq!(span(lim(Some(3_600.0), "MSL", None), lim(Some(23_000.0), "STD", None), None).unwrap().ceiling_ft, 18_000.0);
        // Brady North's FL180 TNI: 17,999 ft MSL.
        assert_eq!(span(lim(Some(3_600.0), "MSL", None), lim(Some(18_000.0), "STD", Some("TNI")), None).unwrap().ceiling_ft, 17_999.0);
        // A floor at or over Class A's has nothing left to draw.
        assert_eq!(span(lim(Some(18_000.0), "STD", None), lim(None, "UNLTD", None), None), None);
        assert_eq!(span(lim(Some(17_999.0), "MSL", None), lim(None, "UNLTD", None), None).unwrap().ceiling_ft, 18_000.0);
    }

    #[test]
    fn no_figure_is_the_surface_below_and_unlimited_above() {
        let s = span(Limit::default(), Limit::default(), None).unwrap();
        assert_eq!(s, Span { floor_ft: 0.0, ceiling_ft: 18_000.0, surface: true });
    }

    #[test]
    fn the_rule_answers_its_contract() {
        let v = json::parse(
            r#"{"floor":{"ft":500,"code":"SFC"},"ceiling":{"ft":6000,"code":"MSL","desc":"TNI"},"ground":{"low_ft":1200,"high_ft":1900}}"#,
        )
        .unwrap();
        assert_eq!(call("airspace_volume_span", &v).unwrap(), r#"{"floor_ft":1700.0,"ceiling_ft":5999.0,"surface":false}"#);
        let v = json::parse(r#"{"floor":{"ft":500,"code":"SFC"},"ceiling":{"ft":6000,"code":"MSL"}}"#).unwrap();
        assert_eq!(call("airspace_volume_span", &v).unwrap(), "null");
        assert!(call("airspace_volume_span", &json::parse(r#"{"ground":{"low_ft":"x"}}"#).unwrap()).is_err());
    }
}
