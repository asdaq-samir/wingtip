//! route options' own tests: which way each kind's name goes to.

use super::*;

fn a_way(kind: &str, air_min: f64, stops: &[&str]) -> Way {
    Way {
        kind: kind.into(),
        kinds: vec![kind.into()],
        title: title(kind).into(),
        stops: stops.iter().map(|s| s.to_string()).collect(),
        fuel: Vec::new(),
        food: Vec::new(),
        path: Vec::new(),
        distance_nm: 0.0,
        air_min,
        ground_min: 0.0,
        fuel_gal: 0.0,
        landings: 0,
        crosses: Vec::new(),
        marginal: Vec::new(),
        along: Along { bands: Vec::new(), tail_kt: 0.0, floor_ft: 0, water_nm: 0 },
    }
}

#[test]
fn the_fastest_is_the_way_that_is_fastest_whatever_search_found_it() {
    // Two ways a search may find, the one called fastest the slower: the
    // name goes to the quicker (KSEA to KSFO's "fastest" was 110
    // minutes slower than the best weather's, out over the Pacific,
    // 2026-10-25).
    let grid = Grid::new((0.0, 0.0), (0.0, 4.0), &[]);
    let found = named(&grid, vec![a_way("fastest", 600.0, &["A"]), a_way("weather", 490.0, &["B"])]);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].stops, vec!["B".to_string()]);
    assert_eq!(found[0].kind, "weather");
    let mut kinds = found[0].kinds.clone();
    kinds.stable_sort();
    assert_eq!(kinds, vec!["fastest", "stops", "weather"]);
}
