//! The corridor a fuel stop is looked for in, and the miles between its
//! fields, each solved once (fuel.rs).

use super::super::stops::MIN_RUNWAY_FT;
use super::{Field, MAX_ADDED_NM};
use crate::geo;
use std::cell::Cell;
use std::collections::HashSet;
use wingtip_core::grid::Point;

/// A field in a flight's corridor, with its miles from the start and on
/// to the end, each solved once for every use after.
pub(super) struct Near<'a> {
    pub field: &'a Field,
    pub to_it: f64,
    pub then: f64,
}

/// The fields no more than MAX_ADDED_NM off the straight line from
/// `start` to `end`, on a paved runway of MIN_RUNWAY_FT, not the route's
/// own (`skip`, by either ident), in the table's order. The runway and
/// the idents are read before the two geodesics a field's miles take.
pub(super) fn corridor<'a>(start: Point, end: Point, direct: f64, fields: &'a [Field], skip: &HashSet<String>) -> Vec<Near<'a>> {
    fields
        .iter()
        .filter(|f| f.runway_ft >= MIN_RUNWAY_FT)
        .filter(|f| !skip.contains(&f.ident) && !skip.contains(&f.faa_ident))
        .filter_map(|f| {
            let to_it = geo::distance_nm(start.0, start.1, f.lat, f.lon);
            let then = geo::distance_nm(f.lat, f.lon, end.0, end.1);
            (to_it + then - direct <= MAX_ADDED_NM).then_some(Near { field: f, to_it, then })
        })
        .collect()
}

/// The miles between the destination and the corridor's fields, each pair
/// solved the way round it is first asked and kept: the search reads only
/// the pairs into the places it settles, about half of them, and every
/// later read is of one it solved. Not mirrored, since a geodesic solved
/// the other way round is not promised to match to the last bit.
pub(super) struct Apart<'p> {
    pub at: &'p [Point],
    pub nm: Vec<Cell<f64>>,
}

impl Apart<'_> {
    pub fn get(&self, i: usize, j: usize) -> f64 {
        let slot = &self.nm[i * self.at.len() + j];
        if slot.get().is_nan() {
            let (a, b) = (self.at[i], self.at[j]);
            slot.set(geo::distance_nm(a.0, a.1, b.0, b.1));
        }
        slot.get()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pair_is_solved_as_asked_and_only_once_asked() {
        let at = [(41.0, -87.0), (42.5, -84.0), (40.2, -80.1)];
        let apart = Apart { at: &at, nm: vec![Cell::new(f64::NAN); 9] };
        assert_eq!(apart.get(1, 2), geo::distance_nm(42.5, -84.0, 40.2, -80.1));
        assert_eq!(apart.get(1, 2), apart.get(1, 2));
        assert_eq!(apart.nm.iter().filter(|c| !c.get().is_nan()).count(), 1);
        assert_eq!(apart.get(2, 1), geo::distance_nm(40.2, -80.1, 42.5, -84.0));
    }
}
