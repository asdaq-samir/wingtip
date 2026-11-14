//! A Class B, C or D shelf's altitudes as the sectional writes them, for
//! the label the web's 3D view stands at each shelf's top
//! (features/plan/map/terrain/airspaceShelves, `airspace_shelf_label`),
//! where every shelf of a Class B otherwise reads as the same flat disc
//! (the owner, 2026-11-14).
//!
//! The FAA's Aeronautical Chart User's Guide (edition of 9 July 2026, VFR
//! Terms and Symbols, "Airspace", p. 16, and its legend "Airspace
//! Information", p. 52):
//!
//! - Class B: "The MSL ceiling and floor altitudes of each sector are
//!   shown in solid blue figures with the last two zeros omitted", the
//!   ceiling over the floor ("Ceiling of Class B in hundreds of feet MSL"
//!   over "Floor of Class B in hundreds of feet MSL"), "SFC" for the
//!   surface: "100" over "30", "100" over "SFC".
//! - Class C: the same, in magenta; "A ceiling value of 'T' indicates the
//!   ceiling is to, but not including, the floor of the overlying Class B
//!   airspace" (the NASR file's UPPER_DESC TNI, the planner's
//!   `ceiling_excluded`).
//! - Class D: its ceiling alone, in hundreds of feet MSL; "A minus in
//!   front of the figure is used to indicate 'from surface to, but not
//!   including...'": "-30".
//!
//! Not written: a floor "upward from above" an altitude, which the chart
//! precedes with a "+", as the volumes the planner sends do not carry the
//! floor's descriptor; the floor is written as the figure, the safer
//! reading (at the figure the pilot is told the shelf is there). A Class
//! E surface area has no figures on the chart, nor here.

use crate::json::{self, Value};
use wingtip_core::ask::Ask;

/// The label's parts: the ceiling as written, the floor as written (None
/// for a Class D, whose floor the chart does not write) and the two as
/// the map sets them, the ceiling over the floor a line apart.
#[derive(Debug, PartialEq)]
pub struct ShelfLabel {
    pub ceiling: String,
    pub floor: Option<String>,
    pub text: String,
}

/// Feet as the chart writes them: hundreds, the last two zeros omitted.
fn hundreds(ft: f64) -> String {
    format!("{}", (ft / 100.0).round() as i64)
}

/// The label of a shelf of `class` (B, C or D) from its floor (feet and
/// reference SFC, AGL or MSL, as wingtip.airspace_at `_floor` sends it),
/// its ceiling (feet MSL) and whether the ceiling is "to but not
/// including"; None for another class or a shelf with no ceiling.
pub fn shelf_label(class: &str, floor_ft: f64, floor_ref: &str, ceiling_ft: Option<f64>, excluded: bool) -> Option<ShelfLabel> {
    let ceiling_ft = ceiling_ft.filter(|c| c.is_finite())?;
    let floor = || {
        if floor_ref.eq_ignore_ascii_case("SFC") || floor_ft <= 0.0 {
            "SFC".to_owned()
        } else if floor_ref.eq_ignore_ascii_case("AGL") {
            format!("{} AGL", hundreds(floor_ft))
        } else {
            hundreds(floor_ft)
        }
    };
    let (ceiling, floor) = match class {
        "B" | "C" => (if excluded { "T".to_owned() } else { hundreds(ceiling_ft) }, Some(floor())),
        "D" => (format!("{}{}", if excluded { "-" } else { "" }, hundreds(ceiling_ft)), None),
        _ => return None,
    };
    let text = match &floor {
        Some(f) => format!("{ceiling}\n{f}"),
        None => ceiling.clone(),
    };
    Some(ShelfLabel { ceiling, floor, text })
}

/// `airspace_shelf_label`: `{class, floor_ft, floor_ref, ceiling_ft,
/// ceiling_excluded?}` to `{ceiling, floor, text}`, or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let label = shelf_label(
        ask.str("class")?,
        ask.opt_num("floor_ft")?.unwrap_or(0.0),
        ask.opt_str("floor_ref")?,
        ask.opt_num("ceiling_ft")?,
        ask.opt_bool("ceiling_excluded")?,
    );
    Ok(match label {
        None => "null".to_owned(),
        Some(l) => {
            let mut o = String::from("{\"ceiling\":");
            json::string(&mut o, &l.ceiling);
            o.push_str(",\"floor\":");
            match &l.floor {
                Some(f) => json::string(&mut o, f),
                None => o.push_str("null"),
            }
            o.push_str(",\"text\":");
            json::string(&mut o, &l.text);
            o.push('}');
            o
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(class: &str, floor: f64, r: &str, ceiling: Option<f64>, excluded: bool) -> Option<String> {
        shelf_label(class, floor, r, ceiling, excluded).map(|l| l.text)
    }

    #[test]
    fn class_b_ceiling_over_floor_in_hundreds() {
        // The Chart User's Guide's Class B: last two zeros omitted, SFC.
        assert_eq!(text("B", 3_000.0, "MSL", Some(10_000.0), false).as_deref(), Some("100\n30"));
        assert_eq!(text("B", 0.0, "SFC", Some(10_000.0), false).as_deref(), Some("100\nSFC"));
        assert_eq!(shelf_label("B", 3_600.0, "MSL", Some(10_000.0), false).unwrap().floor.as_deref(), Some("36"));
    }

    #[test]
    fn class_c_t_for_a_ceiling_under_class_b() {
        assert_eq!(text("C", 1_500.0, "MSL", Some(4_000.0), false).as_deref(), Some("40\n15"));
        assert_eq!(text("C", 0.0, "SFC", Some(3_000.0), true).as_deref(), Some("T\nSFC"));
    }

    #[test]
    fn class_d_its_ceiling_alone_a_minus_for_to_but_not_including() {
        assert_eq!(text("D", 0.0, "SFC", Some(2_500.0), false).as_deref(), Some("25"));
        assert_eq!(text("D", 0.0, "SFC", Some(3_000.0), true).as_deref(), Some("-30"));
    }

    #[test]
    fn nothing_for_class_e_or_no_ceiling() {
        assert_eq!(text("E", 0.0, "SFC", Some(2_500.0), false), None);
        assert_eq!(text("B", 3_000.0, "MSL", None, false), None);
    }

    #[test]
    fn the_rule_answers_its_contract() {
        let v = json::parse(r#"{"class":"D","floor_ft":0,"floor_ref":"SFC","ceiling_ft":3000,"ceiling_excluded":true}"#).unwrap();
        assert_eq!(call("airspace_shelf_label", &v).unwrap(), r#"{"ceiling":"-30","floor":null,"text":"-30"}"#);
        assert!(call("airspace_shelf_label", &json::parse("{}").unwrap()).is_err());
    }
}
