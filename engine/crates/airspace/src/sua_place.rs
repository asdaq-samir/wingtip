//! Where a special-use area's tab sits on its boundary and how it is
//! turned (crate::sua_tab, the charts job's sua_labels.py `_edge_place`).

use crate::view::{Polygon, Pt};

/// Twice a ring's area, unsigned, for the largest of an area's polygons.
fn area(ring: &[Pt]) -> f64 {
    let mut twice = 0.0;
    for k in 0..ring.len() {
        let (a, b) = (ring[k], ring[(k + 1) % ring.len()]);
        twice += a.0 * b.1 - b.0 * a.1;
    }
    twice.abs()
}

/// Where an area's tab goes (sua_labels.py `_edge_place`): the middle of
/// the longest side of its largest polygon's shell, the text's clockwise
/// turn along it in degrees kept upright (-90 to 90), and which side of
/// the text the area is on, 1 below and -1 above, for the map to set the
/// tab just inside the line. In a plane tangent at the polygon's middle
/// (east scaled by the cosine of the latitude), Mercator being
/// conformal. The shell runs counter-clockwise (crate::view's
/// `oriented`), so the area is on its left. None for no polygon.
pub(crate) fn edge_place(polygons: &[Polygon]) -> Option<(Pt, f64, i8)> {
    let polygon = polygons.iter().filter(|p| p.shell.len() >= 2).max_by(|a, b| area(&a.shell).total_cmp(&area(&b.shell)))?;
    let ring = &polygon.shell;
    let (lo, hi) = ring.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), p| (lo.min(p.1), hi.max(p.1)));
    let k = ((lo + hi) / 2.0).to_radians().cos();
    let side_length = |a: Pt, b: Pt| ((b.0 - a.0) * k).hypot(b.1 - a.1);
    // The first of equal sides, as Python's max takes it: max_by keeps
    // the last, so the sides are walked backwards.
    let (a, b) = (0..ring.len())
        .rev()
        .map(|i| (ring[i], ring[(i + 1) % ring.len()]))
        .max_by(|x, y| side_length(x.0, x.1).total_cmp(&side_length(y.0, y.1)))?;
    let (dx, dy) = ((b.0 - a.0) * k, b.1 - a.1);
    let mut turn = dx.atan2(dy).to_degrees() - 90.0;
    let mut flipped = false;
    while turn > 90.0 {
        turn -= 180.0;
        flipped = !flipped;
    }
    while turn <= -90.0 {
        turn += 180.0;
        flipped = !flipped;
    }
    // Along the side the area is on the left, the text's top; read the
    // other way, below it.
    let side = if flipped { 1 } else { -1 };
    Some((((a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0), (turn * 10.0).round() / 10.0, side))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tab_lies_along_the_longest_side_inside_the_area() {
        // A box twice as wide as it is tall, counter-clockwise: its south
        // side (run east, the area to its north, above the text) and its
        // north side (run west, read flipped, the area below) are longest.
        let shell = vec![(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)];
        let (at, angle, side) = edge_place(&[Polygon { shell, holes: Vec::new() }]).unwrap();
        assert_eq!(angle, 0.0);
        assert_eq!((at, side), ((1.0, 0.0), -1));
    }
}
