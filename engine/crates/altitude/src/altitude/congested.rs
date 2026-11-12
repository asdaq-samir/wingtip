//! Whether a point is over a congested area, for 14 CFR 91.119's
//! clearances (floor.rs):
//!
//!   (b) Over congested areas. Over any congested area of a city, town, or
//!   settlement, or over any open air assembly of persons, an altitude of
//!   1,000 feet above the highest obstacle within a horizontal radius of
//!   2,000 feet of the aircraft.
//!
//! (eCFR, Title 14, current to 2026-10-22.) 14 CFR 1.1 does not define a
//! congested area; the FAA judges it case by case, so the planner reads
//! the towns from the Census Bureau (the 2020 urban areas and the
//! gazetteer's places, wingtip.congested) and passes their outlines in. A
//! point counts as over a town when it is inside one or within 2,000 ft of
//! one: an airplane over the town's edge is that close to whatever stands
//! that far outside it. Neither data set knows an open air assembly of
//! persons (a fair, a race), which is the pilot's to see.

use crate::geo;

/// 14 CFR 91.119(b): "within a horizontal radius of 2,000 feet of the
/// aircraft".
pub const RADIUS_FT: f64 = 2000.0;
/// A degree of latitude: sixty nautical miles of 6,076.12 ft (the
/// international nautical mile, 1,852 m), near enough -- the earth's
/// flattening moves it under 1% from the equator to the pole.
pub const FT_PER_DEG_LAT: f64 = 60.0 * 6076.12;

/// An area's outline: polygons, each its outer ring and its holes, each
/// ring (lon, lat) points.
pub type Area = Vec<Vec<Vec<(f64, f64)>>>;

/// Whether an area holds a point: inside a polygon's outline and none of
/// its holes.
pub fn inside(area: &Area, lat: f64, lon: f64) -> bool {
    area.iter().any(|rings| rings.iter().filter(|r| r.len() >= 3 && geo::ring_holds(r, lon, lat)).count() % 2 == 1)
}

/// The least distance from the point to the area's edges, feet: degrees of
/// longitude scaled east-west by the cosine of the point's own latitude
/// (a degree of longitude is that much shorter than one of latitude), so a
/// town 2,100 ft north of a point is not taken as within 2,000. The
/// cosine is held to 0.2 and over, as the planner's grids hold it near the
/// poles.
pub fn edge_ft(area: &Area, lat: f64, lon: f64) -> f64 {
    let scale = lat.to_radians().cos().max(0.2);
    let reach = RADIUS_FT / FT_PER_DEG_LAT;
    let mut least = f64::INFINITY;
    for ring in area.iter().flatten() {
        for w in ring.windows(2) {
            let ((x1, y1), (x2, y2)) = (w[0], w[1]);
            // A segment wholly further than the radius in either axis is
            // passed over unmeasured.
            if (y1.min(y2) - lat) > reach || (lat - y1.max(y2)) > reach {
                continue;
            }
            let (ax, ay) = ((x1 - lon) * scale, y1 - lat);
            let (bx, by) = ((x2 - lon) * scale, y2 - lat);
            let (dx, dy) = (bx - ax, by - ay);
            let len2 = dx * dx + dy * dy;
            let t = if len2 > 0.0 { (-(ax * dx + ay * dy) / len2).clamp(0.0, 1.0) } else { 0.0 };
            let (px, py) = (ax + t * dx, ay + t * dy);
            least = least.min((px * px + py * py).sqrt());
        }
    }
    least * FT_PER_DEG_LAT
}

/// Whether a point is over a congested area: inside one of `areas`, or
/// within RADIUS_FT of one.
pub fn congested(areas: &[&Area], lat: f64, lon: f64) -> bool {
    areas.iter().any(|a| inside(a, lat, lon)) || areas.iter().any(|a| edge_ft(a, lat, lon) <= RADIUS_FT)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A town a mile on a side, its south-west corner at 45 N 90 W, and a
    /// point `north` and `east` feet from that corner.
    fn town() -> (Area, impl Fn(f64, f64) -> (f64, f64)) {
        let (lat, lon): (f64, f64) = (45.0, -90.0);
        let ft_lat = 1.0 / FT_PER_DEG_LAT;
        let ft_lon = ft_lat / lat.to_radians().cos();
        let (e, n) = (lon + 5280.0 * ft_lon, lat + 5280.0 * ft_lat);
        let area = vec![vec![vec![(lon, lat), (e, lat), (e, n), (lon, n), (lon, lat)]]];
        (area, move |north: f64, east: f64| (lat + north * ft_lat, lon + east * ft_lon))
    }

    #[test]
    fn inside_and_within_2000_ft_count_and_beyond_does_not() {
        let (area, at) = town();
        let is = |p: (f64, f64)| congested(&[&area], p.0, p.1);
        assert!(is(at(2640.0, 2640.0)));
        assert!(is(at(-1999.0, 2640.0)) && !is(at(-2001.0, 2640.0)));
        assert!(is(at(2640.0, -1999.0)) && !is(at(2640.0, -2001.0)));
        // Off a corner, the distance is to the corner: 1,980 ft and 2,051.
        assert!(is(at(-1400.0, -1400.0)) && !is(at(-1450.0, -1450.0)));
    }

    #[test]
    fn a_hole_is_not_the_town() {
        let (mut area, at) = town();
        let (c0, c1) = (at(200.0, 200.0), at(5080.0, 5080.0));
        area[0].push(vec![(c0.1, c0.0), (c1.1, c0.0), (c1.1, c1.0), (c0.1, c1.0), (c0.1, c0.0)]);
        // 2,440 ft from the hole's edges: a park, not the town.
        let middle = at(2640.0, 2640.0);
        assert!(!congested(&[&area], middle.0, middle.1));
        let near_edge = at(1500.0, 2640.0);
        assert!(congested(&[&area], near_edge.0, near_edge.1));
    }
}
