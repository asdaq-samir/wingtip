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
