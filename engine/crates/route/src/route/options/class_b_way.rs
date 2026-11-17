//! Avoid Class B, one of the Routes (the owner, 2026-11-17: "You can still
//! avoid class B in the suggested routes"). The plan itself always flies
//! through Class B with the clearance it takes (14 CFR 91.131(a)(1): no
//! one may operate within a Class B area without an ATC clearance); where
//! the route as planned enters one at its altitude, this is the same route
//! with the fixes classb.rs finds round it put in -- each a mile clear of
//! its edge, a VFR waypoint before a GPS fix, no more than 40 nm further
//! -- with the fuel stops it needs and what it meets, as the pilot's own
//! route and the most filed one are offered.

use super::ask::{Ask, ClassBRoute};
use super::grid::Grid;
use super::stops::Fuel;
use super::{own, Way};

/// The kind and the title of the way round the Class B.
pub const KIND: &str = "class_b";
pub const TITLE: &str = "Avoid Class B";

/// The way round the Class B the planner put together (`class_b`), None
/// where the route enters none at its altitude or a leg that does has no
/// way round.
pub(super) fn class_b_way(grid: &mut Grid, gs: &Vec<f64>, a: &Ask, fuel: &Fuel) -> Option<Way> {
    let ClassBRoute { points, idents, landed } = a.class_b.as_ref()?;
    let mut path = vec![a.dep.at];
    path.extend(points.iter().copied());
    path.push(a.dest.at);
    Some(own(grid, gs, a, fuel, &path, idents, landed, KIND, TITLE))
}
