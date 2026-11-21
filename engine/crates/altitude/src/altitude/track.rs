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

/// track_nm from the course at `a` already known: a leg's thousands of
/// obstacles against one course, the bearing solved once, not once each.
pub fn track_from(p: Point, a: Point, course: f64) -> (f64, f64) {
    crate::geo::track_from(p.0, p.1, a, course)
}

/// Whether `p` is surely more than `width_nm` off the geodesic from `a` on
/// `course`, from one inverse solve where track_from takes two or three
/// inverse and direct solves: the cross-track of the right spherical
/// triangle the inverse's distance and angle make (track_from's own first
/// step, sin x = sin s sin A). The sphere's answer is within a small part of
/// a percent of the ellipsoid's (WGS-84's flattening is 1/298, NGA
/// TR8350.2), so the margin of 2 nm and 1% of the distance keeps every
/// point the exact cross-track would keep; a leg's obstacle box, read 7 nm
/// round the whole leg, is mostly far outside its 5 nm corridor.
pub fn surely_off_nm(p: Point, a: Point, course: f64, width_nm: f64) -> bool {
    let (s, to_p) = crate::geo::distance_and_bearing(a.0, a.1, p.0, p.1);
    let r = crate::geo::EARTH_RADIUS_NM;
    let cross = ((s / r).sin() * (to_p - course).to_radians().sin()).clamp(-1.0, 1.0).asin() * r;
    cross.abs() > width_nm + 2.0 + 0.01 * s
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

    #[test]
    fn the_quick_off_the_corridor_test_never_drops_a_point_the_exact_one_keeps() {
        // A long diagonal leg high up, where the sphere and the ellipsoid
        // part most, and a grid over its whole box and beyond.
        let (a, b) = ((44.0, -104.0), (48.5, -92.0));
        let course = crate::geo::bearing_deg(a.0, a.1, b.0, b.1);
        let mut kept = 0;
        let mut dropped = 0;
        for i in 0..=60 {
            for j in 0..=80 {
                let p = (43.5 + i as f64 * 0.09, -104.5 + j as f64 * 0.16);
                let (cross, _) = track_from(p, a, course);
                assert_eq!(track_from(p, a, course), track_nm(p, a, b));
                if surely_off_nm(p, a, course, 5.0) {
                    assert!(cross.abs() > 5.0, "{p:?} dropped at {cross} nm");
                    dropped += 1;
                } else if cross.abs() <= 5.0 {
                    kept += 1;
                }
            }
        }
        assert!(kept > 0 && dropped > kept * 10, "{kept} kept, {dropped} dropped");
    }
}
