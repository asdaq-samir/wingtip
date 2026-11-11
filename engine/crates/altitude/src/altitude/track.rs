//! Where a point stands to a course: wingtip.geo's `_track`, on the same
//! sphere as crate::geo, and the flat measure the IFR floor's 4 nm is
//! taken on.

use crate::geo::{bearing_deg, destination, distance_nm, EARTH_RADIUS_NM};

/// A point as (lat, lon), degrees.
pub type Point = (f64, f64);

/// (cross-track, along-track) in nautical miles from the great circle
/// `a` to `b`, both signed: right of course positive, behind `a`
/// negative (the standard spherical identities, as wingtip.geo has them).
pub fn track_nm(p: Point, a: Point, b: Point) -> (f64, f64) {
    let to_point = bearing_deg(a.0, a.1, p.0, p.1);
    let to_end = bearing_deg(a.0, a.1, b.0, b.1);
    let angular = distance_nm(a.0, a.1, p.0, p.1) / EARTH_RADIUS_NM;
    let offset = (to_point - to_end).to_radians();
    let cross = (angular.sin() * offset.sin()).clamp(-1.0, 1.0).asin() * EARTH_RADIUS_NM;
    let ratio = (angular.cos() / (cross / EARTH_RADIUS_NM).cos()).clamp(-1.0, 1.0);
    let sign = offset.cos();
    let sign = if sign > 0.0 {
        1.0
    } else if sign < 0.0 {
        -1.0
    } else {
        0.0
    };
    (cross, ratio.acos() * EARTH_RADIUS_NM * sign)
}

/// A point's distance from the segment `a` to `b` (its ends rounded, as
/// "within 4 nm of the course" takes the ends too), in nautical miles,
/// on a flat plane about the segment's middle: wingtip.ifr's measure,
/// a few metres off the sphere's at 4 nm on a piece of 10 nm.
pub fn from_segment_nm(p: Point, a: Point, b: Point) -> f64 {
    let k = ((a.0 + b.0) / 2.0).to_radians().cos() * 60.0;
    let plane = |q: Point| ((q.1 - a.1) * k, (q.0 - a.0) * 60.0);
    let (px, py) = plane(p);
    let (bx, by) = plane(b);
    let length2 = bx * bx + by * by;
    let t = if length2 > 0.0 { ((px * bx + py * by) / length2).clamp(0.0, 1.0) } else { 0.0 };
    (px - t * bx).hypot(py - t * by)
}

/// The course `a` to `b` in pieces of at most `piece_nm`, along its great
/// circle, so each is near enough flat for `from_segment_nm`.
pub fn pieces(a: Point, b: Point, piece_nm: f64) -> Vec<(Point, Point)> {
    let total = distance_nm(a.0, a.1, b.0, b.1);
    let count = ((total / piece_nm).ceil() as usize).max(1);
    let bearing = bearing_deg(a.0, a.1, b.0, b.1);
    let mut points = vec![a];
    for i in 1..count {
        points.push(destination(a.0, a.1, bearing, total * i as f64 / count as f64));
    }
    points.push(b);
    points.windows(2).map(|w| (w[0], w[1])).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_point_beside_a_northbound_course_is_right_or_left_and_along_it() {
        let (a, b) = ((45.0, -90.0), (46.0, -90.0));
        let (cross, along) = track_nm((45.5, -89.9), a, b);
        assert!(cross > 4.0 && cross < 4.5, "{cross}");
        assert!((along - 30.0).abs() < 0.1, "{along}");
        let (_, behind) = track_nm((44.9, -90.0), a, b);
        assert!(behind < 0.0);
    }
}
