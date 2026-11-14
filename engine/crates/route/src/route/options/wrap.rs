//! Route options across the antimeridian (the aviation audit's AV-11, the
//! routes audit's P12). The grid is a box of latitude and longitude, its
//! columns from the west edge east: PADK (Adak, 176.6 W) to PASY (Shemya,
//! 174.1 E) read as plain longitudes made it about 350 degrees wide, and
//! every way went round the world. So everything a route's options read
//! is moved to within 180 degrees of the departure's longitude (174.1 E
//! becomes 185.9 W) before the grid is framed, and every longitude handed
//! back is put again between -180 and 180. Distances and the magnetic
//! model take a longitude whole turns away as the same place.

use super::ask::Ask;
use super::grid::Area;
use wingtip_core::grid::Point;

/// `lon`, whole turns added or taken, within 180 degrees of `reference`.
pub fn near(lon: f64, reference: f64) -> f64 {
    lon + 360.0 * ((reference - lon) / 360.0).round()
}

/// A longitude between -180 (inclusive) and 180, as the data writes it.
pub fn normal(lon: f64) -> f64 {
    let l = (lon + 180.0).rem_euclid(360.0) - 180.0;
    if l == -180.0 && lon > 0.0 { 180.0 } else { l }
}

fn point(p: &mut Point, reference: f64) {
    p.1 = near(p.1, reference);
}

fn area(a: &mut Area, reference: f64) {
    // A ring is moved as a whole by its first point, then each point kept
    // beside the one before: a ring drawn across the antimeridian stays
    // one ring.
    for ring in &mut a.rings {
        let mut before = reference;
        for p in ring.iter_mut() {
            p.1 = near(p.1, before);
            before = p.1;
        }
    }
}

/// The ask with every longitude within 180 degrees of the departure's.
pub fn unwrapped(mut a: Ask) -> Ask {
    unwrap(&mut a);
    a
}

/// Every longitude of the ask within 180 degrees of the departure's.
pub fn unwrap(a: &mut Ask) {
    let reference = a.dep.at.1;
    point(&mut a.dest.at, reference);
    for p in a.current.iter_mut().flatten().chain(a.filed.iter_mut().flat_map(|f| f.0.iter_mut())) {
        point(p, reference);
    }
    for r in a.tafs.iter_mut().flatten().chain(a.metars.iter_mut().flatten()) {
        r.lon = near(r.lon, reference);
    }
    for adv in a.sigmets.iter_mut().flatten().chain(a.gairmets.iter_mut().flatten()) {
        area(&mut adv.area, reference);
    }
    for s in a.sua.iter_mut().flatten().chain(a.tfrs.iter_mut().flatten()) {
        area(&mut s.area, reference);
    }
    for s in &mut a.winds {
        s.lon = near(s.lon, reference);
    }
    for f in a.fields.iter_mut().flatten() {
        f.lon = near(f.lon, reference);
    }
    for f in &mut a.fixes {
        f.lon = near(f.lon, reference);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_longitude_is_moved_beside_the_reference_and_back() {
        assert_eq!(near(174.1, -176.6), 174.1 - 360.0);
        assert_eq!(near(-176.6, -176.6), -176.6);
        assert_eq!(near(-170.0, 175.0), 190.0);
        assert!((normal(174.1 - 360.0) - 174.1).abs() < 1e-9);
        assert_eq!(normal(-176.6), -176.6);
        assert_eq!(normal(180.0), 180.0);
        assert_eq!(normal(190.0), -170.0);
    }
}
