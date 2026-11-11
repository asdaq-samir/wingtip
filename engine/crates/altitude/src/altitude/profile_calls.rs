//! The profile's clearance preview and the Altitude Advisor as
//! crate::call answers them (calls.rs dispatches to them), JSON in and out.

use super::calls::{list, num, nums, obj, opt_num, written, R};
use super::{advisor, clearance};
use crate::json::Value;

fn opt_value(x: Option<f64>) -> Value {
    x.map_or(Value::Null, Value::Number)
}

fn opt_text(x: Option<String>) -> Value {
    x.map_or(Value::Null, Value::String)
}

/// `profile_clearance`: the ground samples and obstacles along the route
/// against an altitude (clearance.rs).
pub fn profile_clearance(name: &str, v: &Value) -> R<String> {
    let along = nums(name, v, "along_nm")?;
    let ground = nums(name, v, "ground_ft")?;
    if along.len() != ground.len() {
        return Err(format!("{name}: \"along_nm\" and \"ground_ft\" are not of one length"));
    }
    let mut heights: Vec<clearance::Height> =
        along.iter().zip(&ground).map(|(&along_nm, &ft)| clearance::Height { along_nm, ft, obstacle: false }).collect();
    for o in list(name, v, "obstacles")? {
        heights.push(clearance::Height { along_nm: num(name, o, "along_nm")?, ft: num(name, o, "amsl_ft")?, obstacle: true });
    }
    let points = list(name, v, "points")?
        .iter()
        .map(|p| Ok((p.get("ident").and_then(Value::as_str).unwrap_or("").to_owned(), num(name, p, "along_nm")?)))
        .collect::<R<Vec<_>>>()?;
    let c = clearance::at(num(name, v, "altitude_ft")?, &heights, &points);
    Ok(written(&obj(vec![
        ("red_from_ft", Value::Number(c.red_from_ft)),
        ("yellow_from_ft", Value::Number(c.yellow_from_ft)),
        ("highest_ft", opt_value(c.highest_ft)),
        ("least_ft", opt_value(c.least_ft)),
        ("least_along_nm", opt_value(c.least_along_nm)),
        ("obstacle", Value::Bool(c.obstacle)),
        ("strike_nm", opt_value(c.strike_nm)),
        ("level", opt_text(c.level.map(str::to_owned))),
        ("near", opt_text(c.near)),
        ("words", Value::String(c.words)),
    ])))
}

/// `altitude_advisor`: the Altitude Advisor's rows (advisor.rs).
pub fn altitude_advisor(name: &str, v: &Value) -> R<String> {
    let figures = list(name, v, "figures")?
        .iter()
        .map(|f| {
            Ok(advisor::Figure {
                altitude_ft: num(name, f, "altitude_ft")?,
                ete_min: opt_num(name, f, "ete_min")?,
                fuel_gal: opt_num(name, f, "fuel_gal")?,
                tailwind_kt: opt_num(name, f, "tailwind_kt")?,
                everywhere: !matches!(f.get("everywhere"), Some(Value::Bool(false))),
            })
        })
        .collect::<R<Vec<_>>>()?;
    let plans = list(name, v, "plans")?
        .iter()
        .map(|p| Ok((p.get("kind").and_then(Value::as_str).unwrap_or("").to_owned(), num(name, p, "altitude_ft")?)))
        .collect::<R<Vec<_>>>()?;
    let rows = advisor::rows(&figures, opt_num(name, v, "flown_ft")?, &plans);
    Ok(written(&Value::Array(
        rows.into_iter()
            .map(|r| {
                obj(vec![
                    ("altitude_ft", Value::Number(r.figure.altitude_ft)),
                    ("ete_min", opt_value(r.figure.ete_min)),
                    ("fuel_gal", opt_value(r.figure.fuel_gal)),
                    ("tailwind_kt", opt_value(r.figure.tailwind_kt)),
                    ("legal", Value::Bool(r.legal)),
                    ("flown", Value::Bool(r.flown)),
                    ("fastest", Value::Bool(r.fastest)),
                    ("economical", Value::Bool(r.economical)),
                    ("warning", opt_text(r.warning)),
                ])
            })
            .collect(),
    )))
}
