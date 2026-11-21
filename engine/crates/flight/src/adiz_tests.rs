//! The ADIZs of 14 CFR 99.43-99.49 at fields and over water each side of
//! their lines. The places are the fields' reference points (NASR) or
//! points chosen well inside or outside a line, never on one.

use crate::adiz::{leg_zones, zone_at};

#[test]
fn the_fields_inland_are_in_no_zone() {
    for (why, lat, lon) in [
        ("Chicago O'Hare", 41.98, -87.90),
        ("Miami, landward of 99.43's line", 25.79, -80.29),
        ("Los Angeles, landward of the Pacific line", 33.94, -118.41),
        ("Anchorage", 61.17, -150.00),
        ("Fairbanks", 64.82, -147.86),
        ("Nome, east of the line through 63°45′ N, 165°30′ W", 64.51, -165.45),
        ("Honolulu, inside 99.49(b)'s inner boundary", 21.32, -157.92),
        ("Guam, inside 99.47(a)'s inner boundary", 13.48, 144.80),
        ("Saipan, inside the SAIPAN NDB's arc", 15.12, 145.73),
        ("Nassau, east of the Florida line", 25.04, -77.47),
    ] {
        assert_eq!(zone_at(lat, lon), None, "{why}");
    }
}

#[test]
fn the_water_off_each_coast_is_its_zone() {
    for (why, lat, lon, zone) in [
        ("off New Jersey, inside the outer line to 39°30′ N, 63°45′ W", 38.0, -72.0, "contiguous"),
        ("the Florida Straits", 25.5, -79.8, "contiguous"),
        ("the Gulf, south of Louisiana", 27.5, -91.0, "contiguous"),
        ("off California", 34.0, -122.0, "contiguous"),
        ("Dutch Harbor, west of 163° W", 53.90, -166.54, "alaska"),
        ("Adak", 51.88, -176.65, "alaska"),
        ("Attu, east of 180", 52.83, 173.18, "alaska"),
        ("Hilo, south of the inner boundary's 20° N", 19.72, -155.05, "hawaii"),
        ("north of Kauai, in the band", 24.5, -158.0, "hawaii"),
        ("west of Guam, inside the 250 nm circle", 13.5, 143.0, "guam"),
    ] {
        assert_eq!(zone_at(lat, lon), Some(zone), "{why}");
    }
    // Past the outer lines: the open Atlantic, and 300 nm from Guam.
    assert_eq!(zone_at(35.0, -55.0), None);
    assert_eq!(zone_at(13.54, 150.0), None);
}

#[test]
fn a_leg_meets_the_zones_on_its_way() {
    // Miami to Nassau crosses the Florida Straits' band.
    assert_eq!(leg_zones((25.79, -80.29), (25.04, -77.47)), ["contiguous"]);
    // Brown Field to Tijuana crosses the land border, 99.43's line.
    assert_eq!(leg_zones((32.572, -116.98), (32.541, -116.97)), ["contiguous"]);
    // Adak to Attu, across the antimeridian, stays in Alaska's.
    assert_eq!(leg_zones((51.88, -176.65), (52.83, 173.18)), ["alaska"]);
    // Chicago to Duluth, and Anchorage to Fairbanks: none.
    assert!(leg_zones((41.98, -87.90), (46.84, -92.19)).is_empty());
    assert!(leg_zones((61.17, -150.00), (64.82, -147.86)).is_empty());
}
