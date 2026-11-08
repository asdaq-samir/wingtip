//! Own ship on the FAA's airport diagram (#218): where the airplane is on
//! the d-TPP's airport diagram page, placed by the diagram's own latitude
//! and longitude labels -- "46°51'N", "92°13'W" along its frame -- as the
//! planner places the runways on it for the card's crop
//! (wingtip.publications `_graticule`). The free d-TPP's airport diagrams
//! carry no GeoPDF viewport (checked on cycle 2612's KDLH, KMSP, KRFD and
//! KORD: no /VP, no /Measure), so the labels are the georeference there
//! is. Some diagrams have none (KORD's, KCRQ's): no own ship on those.
//!
//! The apps read the page's text with its positions (PDFKit on the
//! iPhone, PdfRenderer on Android): `diagram_labels` finds the labels in
//! the page's text, the app finds where each is drawn, and
//! `diagram_graticule` fits the page to them; `diagram_point` then puts
//! each fix on the page. A diagram is drawn north up or turned a quarter
//! on its page (KDLH's: north to the left), and either is read.
//!
//! The diagram is the FAA's, for a pilot's situational awareness on the
//! ground, not for navigation: the airplane's own position against the
//! signs and markings is what counts (AC 120-74B, Parts 91, 121, 125 and
//! 135 Flightcrew Procedures During Taxi Operations; AC 120-76D).

use super::num;
use crate::geo::py_mod;
use crate::json::{self, Value};

/// A degree of longitude is a degree of latitude times the cosine of the
/// latitude; a diagram whose two scales disagree with that by more than
/// this is read wrong, or not a plain chart: no own ship on it (the
/// planner's own check, wingtip.publications `_graticule`).
pub const SCALE_TOLERANCE: f64 = 0.15;

/// One label as written: degrees, minutes and its letter.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Label {
    /// Signed degrees: south and west negative.
    pub degrees: f64,
    /// A latitude (N, S) rather than a longitude.
    pub latitude: bool,
}

fn digits(chars: &[char], mut i: usize, most: usize) -> (usize, usize) {
    let start = i;
    while i < chars.len() && chars[i].is_ascii_digit() && i - start < most {
        i += 1;
    }
    (start, i)
}

fn spaces(chars: &[char], mut i: usize) -> usize {
    while i < chars.len() && chars[i] == ' ' {
        i += 1;
    }
    i
}

/// The labels in a text, each with its place (char offsets, end not
/// included): degrees of one to three figures, a degree sign or none (the
/// d-TPP's is sometimes a glyph of its own, not in the text), minutes of
/// one or two figures with a decimal or none, a minute mark, and N, S, E
/// or W -- "43 09'N", "34°12.5'N", "118°22.0'W", as the planner's _DMS reads them.
pub fn labels_in(text: &str) -> Vec<(usize, usize, Label)> {
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() || (i > 0 && chars[i - 1].is_ascii_digit()) {
            i += 1;
            continue;
        }
        let parsed = (|| {
            let (d0, d1) = digits(&chars, i, 3);
            let mut j = spaces(&chars, d1);
            if j < chars.len() && matches!(chars[j], '°' | 'º') {
                j = spaces(&chars, j + 1);
            }
            let (m0, mut m1) = digits(&chars, j, 2);
            if m1 == m0 {
                return None;
            }
            if m1 + 1 < chars.len() && chars[m1] == '.' && chars[m1 + 1].is_ascii_digit() {
                m1 = digits(&chars, m1 + 1, usize::MAX).1;
            }
            j = spaces(&chars, m1);
            if j >= chars.len() || !matches!(chars[j], '\'' | '’' | '′') {
                return None;
            }
            j = spaces(&chars, j + 1);
            let letter = *chars.get(j)?;
            if !matches!(letter, 'N' | 'S' | 'E' | 'W') {
                return None;
            }
            let deg: f64 = chars[d0..d1].iter().collect::<String>().parse().ok()?;
            let min: f64 = chars[m0..m1].iter().collect::<String>().parse().ok()?;
            if min >= 60.0 {
                return None;
            }
            let value = deg + min / 60.0;
            let latitude = matches!(letter, 'N' | 'S');
            if (latitude && value > 90.0) || value > 180.0 {
                return None;
            }
            Some((j + 1, Label { degrees: if matches!(letter, 'S' | 'W') { -value } else { value }, latitude }))
        })();
        match parsed {
            Some((end, label)) => {
                found.push((i, end, label));
                i = end;
            }
            None => i += 1,
        }
    }
    found
}

/// How a diagram's page and the ground match: the page coordinate along
/// `lat_on_x`'s axis is `a * lat + b`, along the other `c * lon + d`, in
/// points from the page's top left; `north_deg` which way north points on
/// the page, clockwise from its top.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Graticule {
    pub lat_on_x: bool,
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub north_deg: f64,
}

/// A least-squares line through (value, at) pairs: (slope, intercept).
fn fit(points: &[(f64, f64)]) -> Option<(f64, f64)> {
    let n = points.len() as f64;
    let (mx, my) = (points.iter().map(|p| p.0).sum::<f64>() / n, points.iter().map(|p| p.1).sum::<f64>() / n);
    let (mut sxy, mut sxx) = (0.0, 0.0);
    for (x, y) in points {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) * (x - mx);
    }
    (sxx > 0.0).then(|| (sxy / sxx, my - sxy / sxx * mx))
}

fn distinct(values: impl Iterator<Item = f64>) -> usize {
    let mut seen: Vec<f64> = Vec::new();
    for v in values {
        if !seen.iter().any(|s| (s - v).abs() < 1e-9) {
            seen.push(v);
        }
    }
    seen.len()
}

/// Along which page axis a kind of label runs: the one its places spread
/// over (labels of one kind sit along one edge of the frame).
fn axis(placed: &[(f64, f64, f64)]) -> bool {
    let spread = |f: fn(&(f64, f64, f64)) -> f64| {
        let (lo, hi) = placed.iter().map(f).fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| (lo.min(v), hi.max(v)));
        hi - lo
    };
    spread(|p| p.1) >= spread(|p| p.2)
}

/// The graticule from the labels placed on the page, `(text, x, y)` each
/// at the middle of where it is drawn, in points from the top left. None
/// with fewer than two different latitudes or longitudes, both kinds
/// along one axis, the scales out of SCALE_TOLERANCE, or a mirrored page.
pub fn graticule(placed: &[(String, f64, f64)]) -> Option<Graticule> {
    let mut lats: Vec<(f64, f64, f64)> = Vec::new();
    let mut lons: Vec<(f64, f64, f64)> = Vec::new();
    for (text, x, y) in placed {
        let found = labels_in(text);
        // A text run holding more than one label has no one place for each.
        if let [(_, _, label)] = found.as_slice() {
            (if label.latitude { &mut lats } else { &mut lons }).push((label.degrees, *x, *y));
        }
    }
    if distinct(lats.iter().map(|p| p.0)) < 2 || distinct(lons.iter().map(|p| p.0)) < 2 {
        return None;
    }
    let lat_on_x = axis(&lats);
    if axis(&lons) == lat_on_x {
        return None;
    }
    let along = |p: &(f64, f64, f64), on_x: bool| if on_x { p.1 } else { p.2 };
    let (a, b) = fit(&lats.iter().map(|p| (p.0, along(p, lat_on_x))).collect::<Vec<_>>())?;
    let (c, d) = fit(&lons.iter().map(|p| (p.0, along(p, !lat_on_x))).collect::<Vec<_>>())?;
    let mid = lats.iter().map(|p| p.0).sum::<f64>() / lats.len() as f64;
    let ratio = (c.abs() / mid.to_radians().cos()) / a.abs();
    if !(1.0 - SCALE_TOLERANCE < ratio && ratio < 1.0 + SCALE_TOLERANCE) {
        return None;
    }
    // North and east as page directions (y down); east must be north
    // turned a quarter clockwise, or the page is mirrored.
    let north = if lat_on_x { (a.signum(), 0.0) } else { (0.0, a.signum()) };
    let east = if lat_on_x { (0.0, c.signum()) } else { (c.signum(), 0.0) };
    if (east.0 - -north.1).abs() > 1e-9 || (east.1 - north.0).abs() > 1e-9 {
        return None;
    }
    let north_deg = py_mod(f64::atan2(north.0, -north.1).to_degrees(), 360.0);
    Some(Graticule { lat_on_x, a, b, c, d, north_deg })
}

/// Where a point on the ground is on the page, (x, y) in points from its
/// top left.
pub fn place(g: &Graticule, lat: f64, lon: f64) -> (f64, f64) {
    let (u, v) = (g.a * lat + g.b, g.c * lon + g.d);
    if g.lat_on_x {
        (u, v)
    } else {
        (v, u)
    }
}

// --- By name ---------------------------------------------------------------

/// `diagram_labels`: the labels as the text writes them, each once, in
/// order, `["46°51'N", ...]`, from `{"text"}`.
pub(super) fn labels_rule(v: &Value) -> Result<String, String> {
    let text = v.get("text").and_then(Value::as_str).ok_or("diagram_labels: \"text\" is missing")?;
    let chars: Vec<char> = text.chars().collect();
    let mut seen: Vec<String> = Vec::new();
    for (start, end, _) in labels_in(text) {
        let written: String = chars[start..end].iter().collect();
        if !seen.contains(&written) {
            seen.push(written);
        }
    }
    let mut out = String::from("[");
    for (k, s) in seen.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, s);
    }
    out.push(']');
    Ok(out)
}

fn graticule_json(out: &mut String, g: &Graticule) {
    out.push_str(&format!("{{\"lat_on_x\":{}", g.lat_on_x));
    for (key, x) in [("a", g.a), ("b", g.b), ("c", g.c), ("d", g.d), ("north_deg", g.north_deg)] {
        out.push_str(&format!(",\"{key}\":"));
        json::number(out, x);
    }
    out.push('}');
}

/// `diagram_graticule`: `{"lat_on_x", "a", "b", "c", "d", "north_deg"}` or
/// null, from `{"labels": [{"text", "x", "y"}]}`, points from the page's
/// top left.
pub(super) fn graticule_rule(v: &Value) -> Result<String, String> {
    let n = "diagram_graticule";
    let placed = match v.get("labels") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|l| Ok((l.get("text").and_then(Value::as_str).unwrap_or("").to_owned(), num(n, l, "x")?, num(n, l, "y")?)))
            .collect::<Result<Vec<_>, String>>()?,
        _ => return Err("diagram_graticule: \"labels\" is not a list".to_owned()),
    };
    let mut out = String::new();
    match graticule(&placed) {
        Some(g) => graticule_json(&mut out, &g),
        None => out.push_str("null"),
    }
    Ok(out)
}

/// `diagram_point`: `{"x", "y", "on_page"}`, from `{"graticule", "lat",
/// "lon", "width", "height"}`, the page's size in points.
pub(super) fn point_rule(v: &Value) -> Result<String, String> {
    let n = "diagram_point";
    let g = v.get("graticule").ok_or("diagram_point: \"graticule\" is missing")?;
    let lat_on_x = matches!(g.get("lat_on_x"), Some(Value::Bool(true)));
    let g = Graticule { lat_on_x, a: num(n, g, "a")?, b: num(n, g, "b")?, c: num(n, g, "c")?, d: num(n, g, "d")?, north_deg: num(n, g, "north_deg")? };
    let (x, y) = place(&g, num(n, v, "lat")?, num(n, v, "lon")?);
    let (w, h) = (num(n, v, "width")?, num(n, v, "height")?);
    let mut out = String::from("{\"x\":");
    json::number(&mut out, x);
    out.push_str(",\"y\":");
    json::number(&mut out, y);
    out.push_str(&format!(",\"on_page\":{}}}", (0.0..=w).contains(&x) && (0.0..=h).contains(&y)));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// KDLH's diagram of d-TPP cycle 2612 (00125AD.PDF), its labels where
    /// PDFKit finds them, turned to the top left: north to the left.
    fn kdlh() -> Vec<(String, f64, f64)> {
        let h = 594.0;
        [("92°13'W", 361.42, 96.50, 4.85, 23.21), ("46°51'N", 66.92, 505.19, 4.85, 23.19), ("46°50'N", 294.17, 505.82, 4.86, 23.21),
         ("92°12'W", 360.26, 254.22, 4.86, 23.21), ("92°11'W", 359.45, 411.88, 4.87, 23.21)]
            .iter()
            .map(|&(t, x, y, w, ht)| (t.to_owned(), x + w / 2.0, h - (y + ht / 2.0)))
            .collect()
    }

    #[test]
    fn labels_are_read_as_the_planner_reads_them() {
        let found = labels_in("43 09'N and 34°12.5'N, 118°22.0'W 89°07'W 89°06'W; 12'N 95°61'W");
        let values: Vec<f64> = found.iter().map(|f| (f.2.degrees * 1e4).round() / 1e4).collect();
        assert_eq!(values, vec![43.15, 34.2083, -118.3667, -89.1167, -89.1]);
        assert!(found[0].2.latitude && !found[2].2.latitude);
    }

    #[test]
    fn kdlh_is_turned_with_north_to_the_left() {
        let g = graticule(&kdlh()).unwrap();
        assert!(g.lat_on_x);
        assert_eq!(g.north_deg, 270.0);
        // The labels' own places come back.
        let (x, _) = place(&g, 46.0 + 51.0 / 60.0, -92.2);
        assert!((x - 69.35).abs() < 0.5, "{x}");
        let (_, y) = place(&g, 46.84, -92.0 - 12.0 / 60.0);
        assert!((y - (594.0 - 265.83)).abs() < 1.0, "{y}");
    }

    #[test]
    fn a_north_up_page_and_too_few_labels() {
        // KRFD's: latitudes down the right edge, longitudes along the foot.
        let placed: Vec<(String, f64, f64)> = vec![
            ("42°13'N".into(), 345.9, 76.4),
            ("42°12'N".into(), 345.9, 248.6),
            ("42°11'N".into(), 345.5, 421.7),
            ("89°07'W".into(), 60.0, 533.6),
            ("89°06'W".into(), 196.0, 533.6),
            ("89°05'W".into(), 332.0, 533.6),
        ];
        let g = graticule(&placed).unwrap();
        assert!(!g.lat_on_x);
        assert_eq!(g.north_deg, 0.0);
        assert!(graticule(&placed[..4]).is_none());
        // One run holding the three longitudes has no place for each.
        let mut run = placed[..3].to_vec();
        run.push(("89°07'W 89°06'W 89°05'W".into(), 196.0, 533.6));
        assert!(graticule(&run).is_none());
    }
}
