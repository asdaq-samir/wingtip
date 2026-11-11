//! The Altitude Advisor: one row per altitude a pilot may pick the cruise
//! from, with the route's time, fuel and wind at it, Fastest and Most
//! economical marked (the owner's plans of 2026-09-30: fastest is the
//! winds', economical the fuel's, climbs included), and the rows outside
//! the route's legal altitudes kept, with a warning -- the owner's "warn,
//! never limit".

use super::cruising;

/// The route flown at one altitude, as the planner worked it out.
#[derive(Clone, Debug, Default)]
pub struct Figure {
    pub altitude_ft: f64,
    pub ete_min: Option<f64>,
    pub fuel_gal: Option<f64>,
    pub tailwind_kt: Option<f64>,
    pub everywhere: bool,
}

/// One row of the advisor.
#[derive(Clone, Debug, Default)]
pub struct Row {
    pub figure: Figure,
    pub legal: bool,
    pub flown: bool,
    pub fastest: bool,
    pub economical: bool,
    /// Why the row is warned of; None for a legal one flown everywhere.
    pub warning: Option<String>,
}

/// The words on a row outside the legal altitudes.
pub const OUTSIDE: &str = "Outside this route's legal altitudes (14 CFR 91.119, 91.159 or 91.179, airspace, clouds or the airplane's ceiling): flown as your own, with its cautions";
/// And on one some legs of which fly their nearest legal altitude.
pub const SOME_LEGS: &str = "Some legs at their nearest legal altitude";

/// The advisor's rows, highest first: the altitude wheel's (cruising::wheel:
/// the legal altitudes, the one flown and every 500 ft from 1,000 to
/// 17,500), each with its figures where the planner has them. Fastest and
/// Most economical are the planner's own plans where given (`plans`, kind
/// and the altitude it cruises at, the highest of its steps); without them,
/// the legal row with the least time and the least fuel.
pub fn rows(figures: &[Figure], flown_ft: Option<f64>, plans: &[(String, f64)]) -> Vec<Row> {
    let legal: Vec<f64> = figures.iter().map(|f| f.altitude_ft).collect();
    let own = flown_ft.filter(|f| !legal.contains(f));
    let least = |key: fn(&Figure) -> Option<f64>| {
        figures.iter().filter_map(|f| key(f).map(|k| (k, f.altitude_ft))).min_by(|a, b| a.0.total_cmp(&b.0)).map(|m| m.1)
    };
    let plan = |kind: &str| plans.iter().find(|p| p.0 == kind).map(|p| p.1);
    let fastest = plan("fastest").or_else(|| least(|f| f.ete_min));
    let economical = plan("economical").or_else(|| least(|f| f.fuel_gal));
    cruising::wheel(&legal, own)
        .into_iter()
        .map(|ft| {
            let figure = figures.iter().find(|f| f.altitude_ft == ft).cloned();
            let is_legal = figure.is_some();
            let warning = match &figure {
                None => Some(OUTSIDE.to_owned()),
                Some(f) if !f.everywhere => Some(SOME_LEGS.to_owned()),
                _ => None,
            };
            Row {
                figure: figure.unwrap_or(Figure { altitude_ft: ft, ..Figure::default() }),
                legal: is_legal,
                flown: flown_ft == Some(ft),
                fastest: fastest == Some(ft),
                economical: economical == Some(ft),
                warning,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(ft: f64, ete: f64, fuel: f64) -> Figure {
        Figure { altitude_ft: ft, ete_min: Some(ete), fuel_gal: Some(fuel), tailwind_kt: Some(0.0), everywhere: true }
    }

    #[test]
    fn marks_the_plans_and_warns_outside_the_legal_ones() {
        let figures = [f(4500.0, 60.0, 9.0), f(6500.0, 55.0, 9.5)];
        let rows = rows(&figures, Some(4500.0), &[]);
        let at = |ft: f64| rows.iter().find(|r| r.figure.altitude_ft == ft).unwrap();
        assert!(at(6500.0).fastest && !at(6500.0).economical);
        assert!(at(4500.0).economical && at(4500.0).flown && at(4500.0).legal);
        assert!(!at(5000.0).legal && at(5000.0).warning.as_deref() == Some(OUTSIDE));
        assert_eq!(rows[0].figure.altitude_ft, 17500.0);
        let planned = super::rows(&figures, None, &[("fastest".to_owned(), 4500.0)]);
        assert!(planned.iter().find(|r| r.figure.altitude_ft == 4500.0).unwrap().fastest);
    }
}
