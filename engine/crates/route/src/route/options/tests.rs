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

#[test]
fn a_missing_airplane_figure_is_unknown_never_a_stock_one() {
    // The owner's rule (2026-11-09): no 12,000 ft ceiling, no 0 gal of
    // usable fuel read as "the tanks reach", for an airplane that does not
    // give them, or for none at all.
    let r = Reader { name: "route_options" };
    let none = r.profile(&json::parse("{\"profile\": null}").unwrap()).unwrap();
    assert_eq!((none.airplane, none.ceiling_ft, none.usable_gal, none.taxi_gal), (false, None, None, None));
    let bare = json::parse("{\"profile\": {\"cruise_tas_kt\": 110, \"fuel_burn_gph\": 8}}").unwrap();
    let own = r.profile(&bare).unwrap();
    assert_eq!((own.airplane, own.ceiling_ft, own.usable_gal, own.taxi_gal), (true, None, None, None));
    // With no ceiling, high ground closes nothing: its floor is still read.
    let mut grid = Grid::new((0.0, 0.0), (0.0, 1.0), &[]);
    let heights = vec![12000.0; grid.rows * PER_CELL * grid.cols * PER_CELL];
    read::ground(&mut grid, &heights, None).unwrap();
    assert!(grid.closed.iter().all(|&c| c < 0) && grid.floor[0] > 12000.0);
    // With one, ground over it is closed as above the airplane's ceiling.
    read::ground(&mut grid, &heights, Some(highest_cruise_ft(Some(12000.0)))).unwrap();
    assert!(grid.closed.iter().all(|&c| c >= 0));
    assert_eq!(grid.hazards[0].name, "High ground above the airplane's ceiling");
}
