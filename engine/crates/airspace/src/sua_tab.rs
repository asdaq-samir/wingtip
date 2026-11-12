//! The tab ForeFlight writes on a special-use area's boundary over the
//! sectional (the owner's screenshot near Brady, TX, 2026-11-12): the
//! area's short name over its limits, "M-BRADY NOR*:" over "3600-FL180",
//! along the area's longest side and just inside it. The same tab the web
//! and Android draw from the overlay tiles' `special_use_labels` layer
//! (services/jobs/charts/sua_labels.py), worked out here from a phone's
//! pack for the iPhone, which reads no vector tiles: the name cut as that
//! job cuts it, the limits as figures with their references (the app
//! writes their words), and where the tab sits and how it is turned.
//!
//! A phone pack keeps each area's figures and the FAA's codes (SFC, MSL,
//! STD, UNLTD; wingtip.sua `_area`) but not ADDS' LOWER_DESC/UPPER_DESC,
//! so a ceiling "to but not including" FL180 is written FL180 here where
//! the tiles, from the FAA's CIFP, write 17999, and a piece the FAA cuts
//! out of its area (EXCLUSION) is not told apart.

use crate::view::{Polygon, Pt};

/// The longest a name is written in its tab, as ForeFlight cuts them:
/// "BRADY NOR" for BRADY NORTH MOA, "BRADY LOW" whole (sua_labels.py
/// NAME_WIDTH).
pub const NAME_WIDTH: usize = 9;
/// The mark of a name cut short (sua_labels.py CUT): on the owner's
/// screenshot ForeFlight puts it on exactly the names it shortens.
pub const CUT: char = '*';

/// The letter ForeFlight puts before an area's name, by the FAA's
/// TYPE_CODE; another type its own code and a hyphen.
fn prefix(type_code: &str) -> String {
    match type_code {
        "MOA" => "M-".to_owned(),
        "" => String::new(),
        other => format!("{other}-"),
    }
}

/// The tab's name: the type's letter and the area's name, an MOA's own
/// word left off and a designator's letter not written twice ("R-2602"),
/// cut to NAME_WIDTH with CUT. A cut keeps every word after the first, as
/// its number or its first letter, so the four Brownwood MOAs stay apart
/// ("M-BROWN 2 W*"): sua_labels.py `label_name`.
pub fn label_name(name: &str, type_code: &str) -> String {
    let prefix = prefix(type_code);
    let upper = name.to_uppercase();
    let mut words: Vec<&str> = upper.split_whitespace().collect();
    if type_code == "MOA" && words.last() == Some(&"MOA") {
        words.pop();
    }
    let joined = words.join(" ");
    let base = if !prefix.is_empty() && joined.starts_with(&prefix) { &joined[prefix.len()..] } else { joined.as_str() };
    if base.chars().count() <= NAME_WIDTH {
        return format!("{prefix}{base}");
    }
    let first = |s: &str, n: usize| -> String { s.chars().take(n).collect() };
    let mut cut = first(base, NAME_WIDTH).trim_end().to_owned();
    if cut.split_whitespace().count() < words.len() {
        let tail: Vec<String> = words[1..]
            .iter()
            .map(|w| if w.chars().all(|c| c.is_ascii_digit()) || w.chars().count() == 1 { (*w).to_owned() } else { first(w, 1) })
            .collect();
        let tail = tail.join(" ");
        let head = first(words[0], 1.max(NAME_WIDTH.saturating_sub(tail.chars().count() + 1)));
        cut = first(&format!("{head} {tail}"), NAME_WIDTH).trim_end().to_owned();
    }
    format!("{prefix}{cut}{CUT}")
}

/// A floor or ceiling as the tab writes it, (feet, reference), from the
/// pack's figure and the FAA's code (sua_labels.py `limit`, less the
/// DESC the pack lacks): "UNL" for no ceiling (UNLTD); "FL" for a flight
/// level (STD, standard pressure, 14 CFR 1.1); "SFC" at the surface, and
/// a height the FAA codes SFC above 0 is that height above the ground,
/// "AGL" (Brady Low's 500 FT SFC, the CIFP's "00500A"); else "MSL".
/// (None, None) where there is no figure to write.
pub fn limit(ft: Option<f64>, code: Option<&str>) -> (Option<f64>, Option<&'static str>) {
    let code = code.unwrap_or("").trim().to_uppercase();
    if code == "UNLTD" {
        return (None, Some("UNL"));
    }
    let Some(ft) = ft.filter(|v| v.is_finite()) else { return (None, None) };
    match code.as_str() {
        "STD" => (Some(ft), Some("FL")),
        "SFC" if ft == 0.0 => (Some(0.0), Some("SFC")),
        "SFC" | "AGL" => (Some(ft), Some("AGL")),
        _ => (Some(ft), Some("MSL")),
    }
}

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
    fn names_are_cut_as_foreflight_cuts_them() {
        // The owner's screenshot near Brady and Brownwood, TX.
        assert_eq!(label_name("BRADY NORTH MOA", "MOA"), "M-BRADY NOR*");
        assert_eq!(label_name("BRADY LOW MOA", "MOA"), "M-BRADY LOW");
        assert_eq!(label_name("BROWNWOOD 2 WEST MOA", "MOA"), "M-BROWN 2 W*");
        // A designator already carries its letter.
        assert_eq!(label_name("R-2602", "R"), "R-2602");
        assert_eq!(label_name("A-220", "A"), "A-220");
    }

    #[test]
    fn limits_take_their_reference_from_the_faas_code() {
        assert_eq!(limit(Some(500.0), Some("SFC")), (Some(500.0), Some("AGL")));
        assert_eq!(limit(Some(0.0), Some("SFC")), (Some(0.0), Some("SFC")));
        assert_eq!(limit(Some(18000.0), Some("STD")), (Some(18000.0), Some("FL")));
        assert_eq!(limit(Some(3600.0), Some("MSL")), (Some(3600.0), Some("MSL")));
        assert_eq!(limit(None, Some("UNLTD")), (None, Some("UNL")));
        assert_eq!(limit(None, Some("MSL")), (None, None));
    }

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
