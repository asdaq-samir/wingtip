use super::*;

/// A little-endian 2D WKB Polygon or MultiPolygon as its polygons' rings'
/// points; None where it is anything else or cut short.
pub(crate) fn rings_of(wkb: &[u8]) -> Option<Vec<Vec<Vec<Pt>>>> {
    fn polygon(wkb: &[u8], at: &mut usize) -> Option<Vec<Vec<Pt>>> {
        if *wkb.get(*at)? != 1 || u32_at(wkb, *at + 1)? != 3 {
            return None;
        }
        let n = u32_at(wkb, *at + 5)? as usize;
        *at += 9;
        let mut rings = Vec::with_capacity(n);
        for _ in 0..n {
            let m = u32_at(wkb, *at)? as usize;
            let points = wkb.get(*at + 4..*at + 4 + 16 * m)?;
            rings.push((0..m).map(|k| (f64_at(points, 16 * k).unwrap(), f64_at(points, 16 * k + 8).unwrap())).collect());
            *at += 4 + 16 * m;
        }
        Some(rings)
    }
    if *wkb.first()? != 1 {
        return None;
    }
    let mut at = 0;
    match u32_at(wkb, 1)? {
        3 => Some(vec![polygon(wkb, &mut at)?]),
        6 => {
            let n = u32_at(wkb, 5)? as usize;
            at = 9;
            (0..n).map(|_| polygon(wkb, &mut at)).collect()
        }
        _ => None,
    }
}

/// Twice the signed area: positive counter-clockwise in lon/lat.
pub(super) fn signed_area(ring: &[Pt]) -> f64 {
    let mut area = 0.0;
    for k in 0..ring.len() {
        let (a, b) = (ring[k], ring[(k + 1) % ring.len()]);
        area += a.0 * b.1 - b.0 * a.1;
    }
    area
}

/// A polygon as the planner draws it: its shell and its holes.
pub(crate) struct Polygon {
    pub(crate) shell: Vec<Pt>,
    pub(crate) holes: Vec<Vec<Pt>>,
}

/// The pack's rings (a shapefile's: outer rings clockwise, holes
/// counter-clockwise, as pyshp reads them into polygons) as the planner's
/// polygons, each oriented as shapely's orient_polygons orients it: the
/// shell counter-clockwise, the holes clockwise, so every line runs with
/// the volume on its left. A hole no outer ring holds is a polygon of its
/// own, as pyshp makes it.
pub(crate) fn oriented(polygons: Vec<Vec<Vec<Pt>>>) -> Vec<Polygon> {
    let mut out = Vec::new();
    for rings in polygons {
        let rings: Vec<Vec<Pt>> = rings.into_iter().filter(|r| r.len() >= 4).collect();
        let mut shells: Vec<Polygon> = Vec::new();
        let mut orphans = Vec::new();
        let mut holes = Vec::new();
        for ring in rings {
            if signed_area(&ring) < 0.0 {
                shells.push(Polygon { shell: ring.into_iter().rev().collect(), holes: Vec::new() });
            } else {
                holes.push(ring);
            }
        }
        for hole in holes {
            match shells.iter_mut().find(|s| geo::ring_holds(&s.shell, hole[0].0, hole[0].1)) {
                Some(shell) => shell.holes.push(hole.into_iter().rev().collect()),
                None => orphans.push(Polygon { shell: hole, holes: Vec::new() }),
            }
        }
        out.extend(shells);
        out.extend(orphans);
    }
    out
}

/// Whether the segment meets the box (Liang and Barsky's clipping).
pub(super) fn segment_meets(a: Pt, b: Pt, view: Bbox) -> bool {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let (mut t0, mut t1) = (0.0f64, 1.0f64);
    for (p, q) in [(-dx, a.0 - view[0]), (dx, view[2] - a.0), (-dy, a.1 - view[1]), (dy, view[3] - a.1)] {
        if p == 0.0 {
            if q < 0.0 {
                return false;
            }
        } else {
            let t = q / p;
            if p < 0.0 {
                t0 = t0.max(t);
            } else {
                t1 = t1.min(t);
            }
            if t0 > t1 {
                return false;
            }
        }
    }
    true
}

/// Whether the polygons reach into the box: a line of theirs crosses it,
/// or a corner of it is inside one -- shapely's intersects, for a box.
pub(crate) fn reaches(polygons: &[Polygon], view: Bbox) -> bool {
    let rings = polygons.iter().flat_map(|p| std::iter::once(&p.shell).chain(p.holes.iter()));
    for ring in rings {
        for k in 0..ring.len() {
            if segment_meets(ring[k], ring[(k + 1) % ring.len()], view) {
                return true;
            }
        }
    }
    let corners = [(view[0], view[1]), (view[0], view[3]), (view[2], view[1]), (view[2], view[3])];
    corners
        .iter()
        .any(|&c| polygons.iter().any(|p| geo::ring_holds(&p.shell, c.0, c.1) && !p.holes.iter().any(|h| geo::ring_holds(h, c.0, c.1))))
}

/// A point's distance from a segment, as GEOS's Distance::pointToSegment.
pub(super) fn to_segment(p: Pt, a: Pt, b: Pt) -> f64 {
    if a == b {
        return ((p.0 - a.0).powi(2) + (p.1 - a.1).powi(2)).sqrt();
    }
    let len2 = (b.0 - a.0).powi(2) + (b.1 - a.1).powi(2);
    let r = ((p.0 - a.0) * (b.0 - a.0) + (p.1 - a.1) * (b.1 - a.1)) / len2;
    if r <= 0.0 {
        return ((p.0 - a.0).powi(2) + (p.1 - a.1).powi(2)).sqrt();
    }
    if r >= 1.0 {
        return ((p.0 - b.0).powi(2) + (p.1 - b.1).powi(2)).sqrt();
    }
    let s = ((a.1 - p.1) * (b.0 - a.0) - (a.0 - p.0) * (b.1 - a.1)) / len2;
    s.abs() * len2.sqrt()
}

/// The line simplified by Douglas and Peucker's method, as GEOS's
/// DouglasPeuckerLineSimplifier (shapely's simplify without topology
/// kept): its ends stay, and between them every point further than the
/// tolerance from the line through the kept ones.
pub fn simplified(points: &[Pt], tolerance: f64) -> Vec<Pt> {
    fn section(points: &[Pt], i: usize, j: usize, tolerance: f64, keep: &mut Vec<bool>) {
        if i + 1 >= j {
            return;
        }
        let (mut far, mut at) = (0.0, i);
        for k in i + 1..j {
            let d = to_segment(points[k], points[i], points[j]);
            if d > far {
                far = d;
                at = k;
            }
        }
        if far > tolerance {
            keep[at] = true;
            section(points, i, at, tolerance, keep);
            section(points, at, j, tolerance, keep);
        }
    }
    if points.len() < 3 {
        return points.to_vec();
    }
    let mut keep = vec![false; points.len()];
    keep[0] = true;
    keep[points.len() - 1] = true;
    section(points, 0, points.len() - 1, tolerance, &mut keep);
    points.iter().zip(keep).filter(|(_, k)| *k).map(|(p, _)| *p).collect()
}

/// A point inside the polygons, as JTS's and GEOS's InteriorPointArea
/// (shapely's representative_point) finds one: the middle of the widest
/// horizontal section through each polygon on a bisector of it safe of
/// its vertices, the widest of them all.
pub(crate) fn representative(polygons: &[Polygon]) -> Option<Pt> {
    let mut best: Option<(f64, Pt)> = None;
    for polygon in polygons {
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        for p in &polygon.shell {
            lo = lo.min(p.1);
            hi = hi.max(p.1);
        }
        // The bisector between the vertices nearest the middle (every
        // ring's, JTS's ScanLineYOrdinateFinder), so it crosses no vertex.
        let centre = (lo + hi) / 2.0;
        let (mut lo_y, mut hi_y) = (lo, hi);
        for p in std::iter::once(&polygon.shell).chain(polygon.holes.iter()).flatten() {
            if p.1 <= centre {
                lo_y = lo_y.max(p.1);
            } else {
                hi_y = hi_y.min(p.1);
            }
        }
        let y = (hi_y + lo_y) / 2.0;
        let mut xs = Vec::new();
        for ring in std::iter::once(&polygon.shell).chain(polygon.holes.iter()) {
            for k in 0..ring.len() {
                let (a, b) = (ring[k], ring[(k + 1) % ring.len()]);
                if (a.1 > y && b.1 > y) || (a.1 < y && b.1 < y) || a.1 == b.1 {
                    continue;
                }
                xs.push(a.0 + (b.0 - a.0) * (y - a.1) / (b.1 - a.1));
            }
        }
        xs.stable_sort_by(|a, b| a.partial_cmp(b).unwrap());
        for pair in xs.as_chunks::<2>().0 {
            let width = pair[1] - pair[0];
            if best.is_none_or(|b| width > b.0) {
                best = Some((width, ((pair[0] + pair[1]) / 2.0, y)));
            }
        }
    }
    best.map(|b| b.1)
}
