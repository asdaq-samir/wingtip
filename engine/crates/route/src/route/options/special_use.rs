//! Special-use airspace on route options' ways (the aviation audit's AV-6,
//! the routes audit's P11 and O2). A prohibited area closes its cells (14
//! CFR 91.133(a), AIM 3-4-2). A restricted area, a MOA, a warning area and
//! an alert area cost more to cross and are never closed: their times of
//! use are not read here, and the owner's rule is to warn, never limit.
//! Each is named among what a way `crosses`, so its card says so:
//!
//! - restricted (AIM 3-4-3): flight "while not wholly prohibited, is
//!   subject to restrictions", and 91.133(a) asks the using or controlling
//!   agency's permission while it is active;
//! - warning (AIM 3-4-4), MOA (AIM 3-4-5) and alert (AIM 3-4-6) areas: VFR
//!   flight is not barred, but a pilot is to know what is going on there.
//!
//! A restricted area is kept apart from a MOA: its warning comes first.

use super::ask::Airspace;
use super::grid::{Grid, Hazard};
use super::read::AIRSPACE_MARGIN_NM;

/// What a restricted area, MOA, warning or alert area costs more to cross,
/// a share of a cell's minutes, for every way: their times of use are not
/// read here, so they are gone round where it costs little, not closed.
pub const SPECIAL_USE_COST: f64 = 0.5;

/// The FAA's special-use kinds a way may cross, as the planner sends them
/// (NASR's SUA types: R, MOA, W, A), each with the hazard's kind and the
/// words its name is given.
const CROSSED: [(&str, &str, &str); 4] =
    [("R", "restricted", "Restricted area"), ("MOA", "moa", "MOA"), ("W", "warning", "Warning area"), ("A", "alert", "Alert area")];

/// Whether a hazard's kind is a special-use area a way may cross.
pub fn is_special_use(kind: &str) -> bool {
    CROSSED.iter().any(|(_, k, _)| *k == kind)
}

/// Prohibited areas closed, a mile round; restricted, MOA, warning and
/// alert areas dearer and marked, each by its name ("Restricted area
/// R-2508", "MOA Bronco", a MOA named so already kept as it is).
pub fn special_use(grid: &mut Grid, areas: &[Airspace]) {
    for a in areas {
        if a.kind == "P" {
            let at = grid.in_area(&a.area, AIRSPACE_MARGIN_NM);
            grid.close(&at, "prohibited", &format!("Prohibited area {}", a.name));
            continue;
        }
        let Some((_, kind, words)) = CROSSED.iter().find(|(k, _, _)| *k == a.kind) else { continue };
        let at = grid.in_area(&a.area, 0.0);
        for &i in &at {
            grid.dear[i] = grid.dear[i].max(SPECIAL_USE_COST);
        }
        let name = if a.name.to_uppercase().contains(&words.to_uppercase()) { a.name.clone() } else { format!("{words} {}", a.name) };
        grid.mark_special(&at, kind, name.trim());
    }
}

/// A way's card's one warning, the worst of what it crosses (`crosses`,
/// indexes into `hazards`), None where it crosses nothing: the engine's
/// words for every app (route::way_warning, its order and its sources),
/// each way's `warning` in route_options' answer.
pub fn way_warning(hazards: &[Hazard], crosses: &[i64]) -> Option<&'static str> {
    crate::route::way_warning::worst(
        crosses.iter().filter_map(|&i| usize::try_from(i).ok().and_then(|i| hazards.get(i))).map(|h| h.kind.as_str()),
    )
}

#[cfg(test)]
mod tests {
    use super::super::grid::Area;
    use super::*;

    fn area(kind: &str, name: &str) -> Airspace {
        // A square a degree a side across the way from (0, 0) to (0, 4),
        // wider than the grid's quarter-degree cells.
        let ring = vec![(-0.5, 1.5), (-0.5, 2.5), (0.5, 2.5), (0.5, 1.5), (-0.5, 1.5)];
        Airspace { kind: kind.into(), name: name.into(), area: Area { rings: vec![ring] } }
    }

    #[test]
    fn a_way_through_a_restricted_area_and_a_moa_says_each_once_restricted_first() {
        let mut grid = Grid::new((0.0, 0.0), (0.0, 4.0), &[]);
        special_use(&mut grid, &[area("MOA", "BRONCO MOA"), area("R", "R-2508"), area("X", "unknown")]);
        let met = super::super::ways::crossed(&grid, &[(0.0, 0.0), (0.0, 4.0)], false);
        let names: Vec<&str> = met.iter().map(|&h| grid.hazards[h as usize].name.as_str()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        assert!(names.contains(&"BRONCO MOA") && names.contains(&"Restricted area R-2508"));
        assert_eq!(way_warning(&grid.hazards, &met), Some("Crosses a restricted area"));
        // Neither closes a cell: the way is flown, and said.
        assert!(grid.closed.iter().all(|&c| c < 0));
        assert!(super::super::ways::crossed(&grid, &[(0.0, 0.0), (0.0, 4.0)], true).is_empty());
    }

    #[test]
    fn the_cards_warning_is_the_worst_crossed() {
        let h = |kind: &str| Hazard { kind: kind.into(), name: String::new() };
        let hazards = [h("moa"), h("weather"), h("tfr"), h("alert"), h("fuel")];
        assert_eq!(way_warning(&hazards, &[0, 1]), Some("Crosses weather"));
        assert_eq!(way_warning(&hazards, &[0, 3]), Some("Crosses a MOA"));
        assert_eq!(way_warning(&hazards, &[3, 2, 4]), Some("Crosses a TFR"));
        assert_eq!(way_warning(&hazards, &[4, 0]), Some("No fuel stop in reach"));
        assert_eq!(way_warning(&hazards, &[3]), Some("Crosses an alert area"));
        assert_eq!(way_warning(&hazards, &[]), None);
    }
}
