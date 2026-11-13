//! Where a point stands to a course: wingtip.geo's `_track`, crate::geo's
//! on WGS-84, and the flat measure the IFR floor's 4 nm is taken on.

use crate::geo::{bearing_deg, destination, distance_nm, Flat};

/// A point as (lat, lon), degrees.
pub type Point = (f64, f64);

/// (cross-track, along-track) in nautical miles from the geodesic `a` to
/// `b`, both signed: right of course positive, behind `a` negative. The
/// engine's one copy, core's geo::track_nm on WGS-84; this takes the
/// point as the floor's and the clouds' Points carry it.
pub fn track_nm(p: Point, a: Point, b: Point) -> (f64, f64) {
    crate::geo::track_nm(p.0, p.1, a, b)
}

/// A point's distance from the segment `a` to `b` (its ends rounded, as
/// "within 4 nm of the course" takes the ends too), in nautical miles,
/// on a flat plane about the segment's middle: wingtip.ifr's measure,
/// a few metres off the sphere's at 4 nm on a piece of 10 nm.
pub fn from_segment_nm(p: Point, a: Point, b: Point) -> f64 {
    let flat = Flat::scaled_at((a.0 + b.0) / 2.0, a.0, a.1);
    let plane = |q: Point| flat.nm(q.0, q.1);
    let (px, py) = plane(p);
    let (bx, by) = plane(b);
    let length2 = bx * bx + by * by;
    let t = if length2 > 0.0 { ((px * bx + py * by) / length2).clamp(0.0, 1.0) } else { 0.0 };
    (px - t * bx).hypot(py - t * by)
}

/// The course `a` to `b` in pieces of at most `piece_nm`, along its
/// geodesic, so each is near enough flat for `from_segment_nm`.
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
