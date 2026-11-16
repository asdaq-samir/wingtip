//! The route's own figures the Go / No-Go's fuel and airspace findings
//! are put together from, out of the nav log's totals and the TFRs the
//! briefing lists: one copy, where the web (useFlightBriefing) and the
//! planner (app.gonogo.flight) each worked them out before asking for the
//! verdict, two copies of rules that must agree (the aviation audit's
//! AV-12).
//!
//! - The least fuel margin over the flights: the whole route's and each
//!   flight's between fuel stops, the least of them, as the tightest leg
//!   is what the reserve rule is held to (14 CFR 91.151(a): enough fuel to
//!   the first point of intended landing and then 30 minutes by day, 45 by
//!   night; 91.167 under IFR).
//! - The fuel required: the route's, else the most any one flight needs.
//! - The reserve, minutes: the route's, else its first flight's.
//! - The TFRs: those the route crosses while they are in force (14 CFR
//!   91.137-91.145, the caller's `crossed`, by NOTAM id) and how many more
//!   the briefing lists near it.

use crate::json::{self, Value};

/// A flight's or the route's totals, as the nav log gives them.
#[derive(Default, Clone, Copy)]
pub struct Fuel {
    pub margin_gal: Option<f64>,
    pub required_gal: Option<f64>,
    pub reserve_min: Option<f64>,
}

/// What the findings are given: the least margin, the fuel required and
/// the reserve.
#[derive(Debug, PartialEq)]
pub struct FuelFigures {
    pub least_margin_gal: Option<f64>,
    pub required_gal: Option<f64>,
    pub reserve_min: Option<f64>,
}

pub fn fuel_figures(route: Option<Fuel>, hops: &[Fuel]) -> FuelFigures {
    let route = route.unwrap_or_default();
    let least_margin_gal = std::iter::once(route.margin_gal).chain(hops.iter().map(|h| h.margin_gal)).flatten().reduce(f64::min);
    let required_gal = route
        .required_gal
        .or_else(|| (!hops.is_empty()).then(|| hops.iter().map(|h| h.required_gal.unwrap_or(0.0)).fold(f64::MIN, f64::max)));
    let reserve_min = route.reserve_min.or_else(|| hops.first().and_then(|h| h.reserve_min));
    FuelFigures { least_margin_gal, required_gal, reserve_min }
}

fn num(v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("gonogo_route_figures: \"{key}\" is not a number")),
    }
}

fn fuel_of(v: &Value) -> Result<Fuel, String> {
    Ok(Fuel { margin_gal: num(v, "fuel_margin_gal")?, required_gal: num(v, "fuel_required_gal")?, reserve_min: num(v, "reserve_min")? })
}

/// `gonogo_route_figures`: `{totals, tfr_count, crossed}` (the nav log's
/// totals as the planner answers them, how many TFRs the briefing lists,
/// and the NOTAM ids of those crossed in force) answered with the fuel's
/// figures and the TFRs in force and near.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "gonogo_route_figures" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let totals = v.get("totals").filter(|t| !matches!(t, Value::Null));
    let route = totals.map(fuel_of).transpose()?;
    let mut hops = Vec::new();
    if let Some(Value::Array(listed)) = totals.and_then(|t| t.get("hops")) {
        for hop in listed {
            hops.push(fuel_of(hop.get("totals").unwrap_or(&Value::Null))?);
        }
    }
    let figures = fuel_figures(route, &hops);
    let crossed: Vec<String> = match v.get("crossed") {
        Some(Value::Array(ids)) => ids.iter().filter_map(|id| id.as_str().map(str::to_owned)).collect(),
        _ => Vec::new(),
    };
    let listed = num(v, "tfr_count")?.unwrap_or(0.0);
    let mut out = String::from("{\"least_margin_gal\":");
    json::opt_number(&mut out, figures.least_margin_gal);
    out.push_str(",\"required_gal\":");
    json::opt_number(&mut out, figures.required_gal);
    out.push_str(",\"reserve_min\":");
    json::opt_number(&mut out, figures.reserve_min);
    out.push_str(",\"tfrs_in_force\":");
    super::strings(&mut out, &crossed);
    out.push_str(",\"tfrs_near\":");
    json::number(&mut out, (listed - crossed.len() as f64).max(0.0));
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{fuel_figures, Fuel, FuelFigures};

    const fn fuel(margin: Option<f64>, required: Option<f64>, reserve: Option<f64>) -> Fuel {
        Fuel { margin_gal: margin, required_gal: required, reserve_min: reserve }
    }

    #[test]
    fn the_least_margin_over_the_route_and_its_flights() {
        let got = fuel_figures(Some(fuel(Some(12.0), Some(30.0), Some(30.0))), &[fuel(Some(4.5), None, None), fuel(Some(9.0), None, None)]);
        assert_eq!(got, FuelFigures { least_margin_gal: Some(4.5), required_gal: Some(30.0), reserve_min: Some(30.0) });
    }

    #[test]
    fn with_no_route_figure_the_flights_say_it() {
        // Required: the most any flight needs; the reserve: the first's.
        let got = fuel_figures(Some(fuel(None, None, None)), &[fuel(None, Some(18.0), Some(45.0)), fuel(None, Some(22.0), Some(30.0))]);
        assert_eq!(got, FuelFigures { least_margin_gal: None, required_gal: Some(22.0), reserve_min: Some(45.0) });
    }

    #[test]
    fn nothing_known_is_nothing() {
        assert_eq!(fuel_figures(None, &[]), FuelFigures { least_margin_gal: None, required_gal: None, reserve_min: None });
    }
}
