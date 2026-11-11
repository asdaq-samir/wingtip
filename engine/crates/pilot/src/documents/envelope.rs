//! A centre-of-gravity envelope as read off a handbook's chart: its
//! corners, arm (inches aft of the datum) and weight (pounds), in the
//! order they go round. The weight and balance (brief's gonogo
//! weight_balance) holds a loading inside it, so it must be a closed,
//! simple polygon: three corners at least, none twice, and no side
//! crossing another, which is what corners read out of order make.

/// A corner: arm, weight.
pub type Corner = (f64, f64);

/// The corners closed: a last corner the same as the first, as a chart's
/// outline is often read, is dropped, since the polygon closes itself.
pub fn closed(corners: &[Corner]) -> Vec<Corner> {
    let mut c = corners.to_vec();
    if c.len() > 1 && same(c[0], c[c.len() - 1]) {
        c.pop();
    }
    c
}

fn same(a: Corner, b: Corner) -> bool {
    (a.0 - b.0).abs() < 1e-9 && (a.1 - b.1).abs() < 1e-9
}

/// Corners that appear twice (after closing).
pub fn repeated(c: &[Corner]) -> bool {
    c.iter().enumerate().any(|(i, a)| c[i + 1..].iter().any(|b| same(*a, *b)))
}

fn cross(o: Corner, a: Corner, b: Corner) -> f64 {
    (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
}

/// Whether two sides cross where neither ends: the sides' ends are each on
/// the other's two sides.
fn sides_cross(p1: Corner, p2: Corner, q1: Corner, q2: Corner) -> bool {
    let d1 = cross(q1, q2, p1);
    let d2 = cross(q1, q2, p2);
    let d3 = cross(p1, p2, q1);
    let d4 = cross(p1, p2, q2);
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0)) && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}

/// Whether any two sides that do not share a corner cross: the corners
/// are out of order.
pub fn self_crossing(c: &[Corner]) -> bool {
    let n = c.len();
    if n < 4 {
        return false;
    }
    for i in 0..n {
        for j in i + 1..n {
            // Neighbours share a corner, and so do the last and the first.
            if j == i + 1 || (i == 0 && j == n - 1) {
                continue;
            }
            if sides_cross(c[i], c[(i + 1) % n], c[j], c[(j + 1) % n]) {
                return true;
            }
        }
    }
    false
}

/// The area the corners enclose (the shoelace formula), inch-pounds: none
/// where they are all on one line.
pub fn area(c: &[Corner]) -> f64 {
    let n = c.len();
    let twice: f64 = (0..n).map(|i| c[i].0 * c[(i + 1) % n].1 - c[(i + 1) % n].0 * c[i].1).sum();
    (twice / 2.0).abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    // A Cessna 172-like normal-category outline, corners going round.
    const ROUND: [Corner; 5] = [(35.0, 1500.0), (35.0, 1950.0), (38.5, 2300.0), (47.3, 2300.0), (47.3, 1500.0)];

    #[test]
    fn a_closed_outline_loses_its_last_corner() {
        let mut c = ROUND.to_vec();
        c.push(ROUND[0]);
        assert_eq!(closed(&c), ROUND.to_vec());
    }

    #[test]
    fn corners_in_order_do_not_cross() {
        assert!(!self_crossing(&ROUND));
        assert!(area(&ROUND) > 0.0);
    }

    #[test]
    fn two_corners_swapped_cross() {
        let c = [ROUND[0], ROUND[1], ROUND[3], ROUND[2], ROUND[4]];
        assert!(self_crossing(&c));
    }

    #[test]
    fn corners_on_a_line_enclose_nothing() {
        assert_eq!(area(&[(35.0, 1500.0), (40.0, 1500.0), (45.0, 1500.0)]), 0.0);
    }
}
