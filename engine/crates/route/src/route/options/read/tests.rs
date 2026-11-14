//! read.rs's tests: the cruising altitudes and the figures' words.

use super::*;

#[test]
fn the_highest_cruise_either_way_under_the_ceiling() {
    // 91.159: 13,000 ft reaches 11,500 east and 12,500 west, so 11,500.
    assert_eq!(highest_cruise_ft(Some(13000.0)), 11500.0);
    assert_eq!(highest_cruise_ft(Some(30000.0)), 16500.0);
    assert_eq!(highest_cruise_ft(Some(4000.0)), 0.0);
    assert_eq!(highest_cruise_ft(Some(4500.0)), 3500.0);
}

#[test]
fn commas_as_python_writes_them() {
    assert_eq!(thousands(2500.0), "2,500");
    assert_eq!(thousands(300.0), "300");
    assert_eq!(thousands(12000.0), "12,000");
}

#[test]
fn the_cruising_altitudes_to_the_top() {
    assert_eq!(cruising_altitudes(5500.0), vec![3500.0, 4500.0, 5500.0]);
    assert!(cruising_altitudes(0.0).is_empty());
}

/// One station over a small grid on the equator with `wind` (from, kt) at
/// the one altitude `at_ft` of `altitudes`, none at the rest.
fn one_station(altitudes: &[f64], at_ft: f64, wind: (f64, f64)) -> Vec<Station> {
    let winds = altitudes.iter().map(|a| (*a == at_ft).then_some(wind)).collect();
    vec![Station { lat: 0.0, lon: 0.5, winds }]
}

/// The best groundspeed out of the first cell on the true course `course`.
fn way_gs(gs: &[f64], grid: &Grid, course: f64) -> f64 {
    let k = STEPS
        .iter()
        .position(|&(dr, dc)| (geo::py_mod(flat_bearing(grid.lats[0], dr as f64, dc as f64).to_degrees(), 360.0) - course).abs() < 1.0)
        .unwrap();
    gs[k]
}

#[test]
fn each_way_tries_its_own_halfs_altitudes_to_the_ceiling() {
    // 91.159: under a 13,000 ft ceiling westbound reaches 12,500, though
    // eastbound stops at 11,500; a 50 kt east wind at 12,500 alone is a
    // westbound way's tailwind (AV-16).
    let grid = Grid::new((0.0, 0.0), (0.0, 1.0), &[]);
    let altitudes = cruising_altitudes(cruise_top_ft(Some(13000.0)));
    assert_eq!(altitudes.last(), Some(&12500.0));
    let gs = groundspeeds(&grid, &one_station(&altitudes, 12500.0, (90.0, 50.0)), &altitudes, 100.0, &|_, _| 0.0);
    assert!((way_gs(&gs, &grid, 270.0) - 150.0).abs() < 1e-6);
    assert!((way_gs(&gs, &grid, 90.0) - 100.0).abs() < 1e-6);
}

#[test]
fn a_ways_half_of_91_159_goes_by_the_cells_own_variation() {
    // Due south true: 5 degrees east makes it 175 magnetic (eastbound, odd
    // thousands), 5 west 185 (westbound, even); a 50 kt north wind at
    // 4,500 ft only is a tailwind only where 4,500 may be flown.
    let grid = Grid::new((0.0, 0.0), (1.0, 0.0), &[]);
    let altitudes = cruising_altitudes(cruise_top_ft(Some(13000.0)));
    let stations = one_station(&altitudes, 4500.0, (360.0, 50.0));
    let west = groundspeeds(&grid, &stations, &altitudes, 100.0, &|_, _| -5.0);
    let east = groundspeeds(&grid, &stations, &altitudes, 100.0, &|_, _| 5.0);
    assert!((way_gs(&west, &grid, 180.0) - 150.0).abs() < 1e-6);
    assert!((way_gs(&east, &grid, 180.0) - 100.0).abs() < 1e-6);
}
