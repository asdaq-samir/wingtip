//! The designated mountainous areas, 14 CFR Part 95 subpart B (95.11 to
//! 95.21), over which 91.177(a)(2)(i)'s minimum IFR altitude is 2,000 ft
//! above the highest obstacle within 4 nm rather than 1,000. Moved from
//! wingtip.ifr's shapely polygons. They are regulation, not cycle data
//! (Part 95 subpart B has not moved in decades), so they are written here
//! once rather than carried in each cycle pack, and the phones have them
//! offline with the engine.
//!
//! In (lat, lon), west longitudes negative. Where Part 95 runs a boundary
//! along a border or a coastline the polygon below runs past it instead
//! -- into Canada or Mexico or out to sea -- which keeps every part of the
//! United States the rule names in, and adds only ground outside it; where
//! an exception runs along one, its polygon takes the straight line inside
//! it, which can only leave some of the exception mountainous: 2,000 ft
//! where 1,000 would do, never the other way.

use super::track::Point;

const fn dms(deg: f64, minutes: f64) -> f64 {
    deg + minutes / 60.0
}

// 95.13(a): from 47°10'N 67°55'W "west and south along the Canadian
// border" to 45°00'N 74°15'W -- run north of the border here.
const EASTERN: &[Point] = &[
    (dms(47.0, 10.0), -dms(67.0, 55.0)), (48.5, -dms(67.0, 55.0)), (48.5, -71.0), (45.5, -74.25),
    (dms(45.0, 0.0), -dms(74.0, 15.0)), (dms(44.0, 20.0), -dms(75.0, 30.0)), (dms(43.0, 5.0), -dms(75.0, 30.0)),
    (dms(42.0, 57.0), -dms(77.0, 30.0)), (dms(42.0, 52.0), -dms(78.0, 42.0)), (dms(42.0, 26.0), -dms(79.0, 13.0)),
    (dms(42.0, 5.0), -dms(80.0, 0.0)), (dms(40.0, 50.0), -dms(80.0, 0.0)), (dms(40.0, 26.0), -dms(79.0, 54.0)),
    (dms(38.0, 25.0), -dms(81.0, 46.0)), (dms(36.0, 0.0), -dms(86.0, 0.0)), (dms(33.0, 37.0), -dms(86.0, 45.0)),
    (dms(32.0, 30.0), -dms(86.0, 25.0)), (dms(33.0, 22.0), -dms(85.0, 0.0)), (dms(36.0, 35.0), -dms(79.0, 20.0)),
    (dms(40.0, 11.0), -dms(76.0, 24.0)), (dms(41.0, 24.0), -dms(74.0, 30.0)), (dms(41.0, 43.0), -dms(72.0, 40.0)),
    (dms(42.0, 13.0), -dms(72.0, 44.0)), (dms(43.0, 12.0), -dms(71.0, 30.0)), (dms(43.0, 45.0), -dms(70.0, 30.0)),
    (dms(45.0, 0.0), -dms(69.0, 30.0)),
];
// 95.13(b): the Hudson, Champlain and Mohawk valleys.
const EASTERN_EXCEPTION: &[Point] = &[
    (dms(45.0, 0.0), -dms(73.0, 26.0)), (dms(44.0, 32.0), -dms(73.0, 4.0)), (dms(42.0, 51.0), -dms(73.0, 41.0)),
    (dms(41.0, 38.0), -dms(73.0, 46.0)), (dms(41.0, 16.0), -dms(73.0, 50.0)), (dms(41.0, 17.0), -dms(74.0, 0.0)),
    (dms(41.0, 25.0), -dms(73.0, 58.0)), (dms(41.0, 26.0), -dms(74.0, 1.0)), (dms(41.0, 37.0), -dms(73.0, 58.0)),
    (dms(42.0, 41.0), -dms(73.0, 55.0)), (dms(43.0, 2.0), -dms(76.0, 15.0)), (dms(43.0, 17.0), -dms(75.0, 21.0)),
    (dms(42.0, 59.0), -dms(74.0, 43.0)), (dms(42.0, 52.0), -dms(73.0, 53.0)), (dms(44.0, 30.0), -dms(73.0, 18.0)),
    (dms(45.0, 0.0), -dms(73.0, 39.0)),
];
// 95.15(a): west of this line, "from the Pacific coastline ... along the
// Canadian and Mexican borders" -- run out past both, and to sea.
const WESTERN: &[Point] = &[
    (dms(49.0, 0.0), -dms(108.0, 0.0)), (dms(46.0, 45.0), -dms(104.0, 0.0)), (dms(44.0, 6.0), -dms(103.0, 15.0)),
    (dms(43.0, 0.0), -dms(103.0, 15.0)), (dms(41.0, 52.0), -dms(103.0, 39.0)), (dms(35.0, 11.0), -dms(103.0, 39.0)),
    (dms(33.0, 17.0), -dms(104.0, 27.0)), (dms(32.0, 17.0), -dms(104.0, 14.0)), (dms(29.0, 48.0), -dms(102.0, 0.0)),
    (25.0, -102.0), (25.0, -130.0), (50.0, -130.0), (50.0, -108.0),
];
// 95.15(b)(1): California's Central Valley.
const CENTRAL_VALLEY: &[Point] = &[
    (dms(35.0, 25.0), -dms(119.0, 9.0)), (dms(35.0, 29.0), -dms(118.0, 58.0)), (dms(36.0, 49.0), -dms(119.0, 37.0)),
    (dms(38.0, 30.0), -dms(121.0, 24.0)), (dms(39.0, 30.0), -dms(121.0, 32.0)), (dms(40.0, 8.0), -dms(122.0, 8.0)),
    (dms(40.0, 6.0), -dms(122.0, 20.0)), (dms(39.0, 5.0), -dms(122.0, 12.0)), (dms(38.0, 1.0), -dms(121.0, 51.0)),
    (dms(37.0, 37.0), -dms(121.0, 12.0)), (dms(37.0, 0.0), -dms(120.0, 58.0)), (dms(36.0, 14.0), -dms(120.0, 11.0)),
];
// 95.15(b)(2): Puget Sound, its run "north and east along the United
// States and Canada boundary" taken straight, inside the boundary.
const PUGET_SOUND: &[Point] = &[
    (dms(49.0, 0.0), -dms(122.0, 21.0)), (dms(48.0, 34.0), -dms(122.0, 21.0)), (dms(48.0, 8.0), -dms(122.0, 0.0)),
    (dms(47.0, 12.0), -dms(122.0, 0.0)), (dms(46.0, 59.0), -dms(122.0, 13.0)), (dms(46.0, 52.0), -dms(122.0, 16.0)),
    (dms(46.0, 50.0), -dms(122.0, 40.0)), (dms(46.0, 35.0), -dms(122.0, 48.0)), (dms(46.0, 35.0), -dms(123.0, 17.0)),
    (dms(47.0, 15.0), -dms(123.0, 17.0)), (dms(47.0, 41.0), -dms(122.0, 54.0)), (dms(48.0, 3.0), -dms(122.0, 48.0)),
    (dms(48.0, 17.0), -dms(123.0, 15.0)),
];
// 95.17: the State of Alaska, all of it here, in a box that takes in some
// of Canada beside it: its seven exceptions (the Fairbanks-Nenana,
// Anchorage-Homer and North Slope areas among them) are left mountainous,
// 2,000 ft where Part 95 asks 1,000. West of 180° too, for the Aleutians.
const ALASKA: &[Point] = &[(51.0, -180.0), (72.0, -180.0), (72.0, -129.9), (51.0, -129.9)];
const ALEUTIANS_WEST: &[Point] = &[(51.0, 172.0), (56.0, 172.0), (56.0, 180.0), (51.0, 180.0)];
// 95.19: Kauai, Oahu, Molokai, Lanai, Kahoolawe, Maui and Hawaii, and the
// water between them here.
const HAWAII: &[Point] = &[(18.8, -159.9), (22.3, -159.9), (22.3, -154.7), (18.8, -154.7)];
// 95.21: Puerto Rico's.
const PUERTO_RICO: &[Point] = &[
    (dms(18.0, 22.0), -dms(66.0, 58.0)), (dms(18.0, 19.0), -dms(66.0, 6.0)), (dms(18.0, 20.0), -dms(65.0, 50.0)),
    (dms(18.0, 20.0), -dms(65.0, 42.0)), (dms(18.0, 3.0), -dms(65.0, 52.0)), (dms(18.0, 2.0), -dms(65.0, 51.0)),
    (dms(17.0, 59.0), -dms(65.0, 55.0)), (dms(18.0, 5.0), -dms(66.0, 57.0)), (dms(18.0, 11.0), -dms(67.0, 7.0)),
];

/// Each area and the exceptions cut out of it.
const AREAS: &[(&[Point], &[&[Point]])] = &[
    (EASTERN, &[EASTERN_EXCEPTION]),
    (WESTERN, &[CENTRAL_VALLEY, PUGET_SOUND]),
    (ALASKA, &[]),
    (ALEUTIANS_WEST, &[]),
    (HAWAII, &[]),
    (PUERTO_RICO, &[]),
];

/// Whether a point is inside a ring or on its edge, on the plane of
/// longitude and latitude, as shapely takes the polygons.
fn inside(ring: &[Point], p: Point) -> bool {
    let (x, y) = (p.1, p.0);
    let mut odd = false;
    for i in 0..ring.len() {
        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
        let (ax, ay, bx, by) = (a.1, a.0, b.1, b.0);
        // On the edge counts as in (shapely's intersects).
        let cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if cross.abs() < 1e-12 && x >= ax.min(bx) && x <= ax.max(bx) && y >= ay.min(by) && y <= ay.max(by) {
            return true;
        }
        if (ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax {
            odd = !odd;
        }
    }
    odd
}

/// Strictly inside a ring, its edge not counted: an exception's edge is
/// still the area's.
fn within(ring: &[Point], p: Point) -> bool {
    inside(ring, p) && !on_edge(ring, p)
}

fn on_edge(ring: &[Point], p: Point) -> bool {
    let (x, y) = (p.1, p.0);
    (0..ring.len()).any(|i| {
        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
        let cross = (b.1 - a.1) * (y - a.0) - (b.0 - a.0) * (x - a.1);
        cross.abs() < 1e-12 && x >= a.1.min(b.1) && x <= a.1.max(b.1) && y >= a.0.min(b.0) && y <= a.0.max(b.0)
    })
}

/// Whether a point is in a designated mountainous area.
pub fn at(p: Point) -> bool {
    AREAS.iter().any(|(area, cut)| inside(area, p) && !cut.iter().any(|c| within(c, p)))
}

/// Where along the segment `a`-`b` (0 to 1) it crosses an edge of `ring`,
/// on the plane.
fn crossings(ring: &[Point], a: Point, b: Point, out: &mut Vec<f64>) {
    let (px, py, rx, ry) = (a.1, a.0, b.1 - a.1, b.0 - a.0);
    for i in 0..ring.len() {
        let (c, d) = (ring[i], ring[(i + 1) % ring.len()]);
        let (qx, qy, sx, sy) = (c.1, c.0, d.1 - c.1, d.0 - c.0);
        let denom = rx * sy - ry * sx;
        if denom.abs() < 1e-15 {
            continue;
        }
        let t = ((qx - px) * sy - (qy - py) * sx) / denom;
        let u = ((qx - px) * ry - (qy - py) * rx) / denom;
        if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
            out.push(t);
        }
    }
}

/// Whether the course from `a` to `b`, a straight line on the plane as
/// wingtip.ifr drew it, crosses a designated mountainous area anywhere:
/// its 2,000 ft then holds for the whole leg. Membership changes only
/// where the line crosses an edge, so the ends, every crossing and a
/// point between each two decide it.
pub fn crossed(a: Point, b: Point) -> bool {
    let mut ts = vec![0.0, 1.0];
    for (area, cut) in AREAS {
        crossings(area, a, b, &mut ts);
        for c in *cut {
            crossings(c, a, b, &mut ts);
        }
    }
    ts.sort_by(f64::total_cmp);
    let point = |t: f64| (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t);
    ts.iter().any(|&t| at(point(t))) || ts.windows(2).any(|w| at(point((w[0] + w[1]) / 2.0)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rockies_and_appalachians_are_mountainous_and_the_plains_and_valleys_not() {
        assert!(at((39.74, -105.0))); // Denver, 95.15(a)
        assert!(at((35.6, -82.55))); // Asheville, 95.13(a)
        assert!(!at((41.98, -87.9))); // Chicago
        assert!(!at((38.55, -121.5))); // Sacramento, 95.15(b)(1)
        assert!(!at((42.75, -73.8))); // Albany, 95.13(b)
        assert!(at((61.17, -150.0))); // Anchorage, all Alaska here
        assert!(at((19.7, -155.1))); // Hilo, 95.19
    }

    #[test]
    fn a_leg_from_the_plains_into_the_rockies_crosses_them() {
        assert!(crossed((40.0, -100.0), (40.0, -106.0)));
        assert!(!crossed((41.0, -88.0), (42.0, -89.0)));
    }
}
