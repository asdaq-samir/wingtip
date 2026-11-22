//! The hot spots on the FAA's airport diagram, placed on the ground for
//! the runway proximity advisor (wingtip-wording's `runway_proximity`)
//! and ringed on the own-ship diagram.
//!
//! A hot spot is "a location on an airport movement area with a history
//! of potential risk of a collision or runway incursion" (AC 150/5300-13B
//! Appendix A, 49). The d-TPP's airport diagram draws each as a circle
//! with its label, "HS 1", "HS 2" (checked on cycle 2611's diagrams:
//! 00046AD's KBLV has "HS 1" and "HS 2", 00923AD's three), and the Chart
//! Supplement's Hot Spots section and the d-TPP's HOT page describe them
//! by the same names. The diagram's label is where it is drawn, so the
//! app finds each label on the page as it finds the latitude and longitude
//! labels (diagram.rs), and the graticule takes it to the ground. The
//! label sits beside its circle, not in it, so the place is the circle's
//! within a label's width: good for a reminder 500 ft out, never for
//! taxiing by.

use super::diagram::{graticule_in, Graticule};
use super::num;
use crate::json::{self, Value};

/// The hot spot labels in a text, each as written, once, in order: "HS"
/// and a number of one or two figures, with a space or none ("HS 1",
/// "HS12"), not inside a longer word.
pub fn labels_in(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut seen: Vec<String> = Vec::new();
    let mut i = 0;
    while i + 2 < chars.len() {
        let starts_word = i == 0 || !chars[i - 1].is_ascii_alphanumeric();
        if !(starts_word && chars[i] == 'H' && chars[i + 1] == 'S') {
            i += 1;
            continue;
        }
        let mut j = i + 2;
        if chars.get(j) == Some(&' ') {
            j += 1;
        }
        let start = j;
        while j < chars.len() && chars[j].is_ascii_digit() && j - start < 2 {
            j += 1;
        }
        let ends_word = chars.get(j).is_none_or(|c| !c.is_ascii_alphanumeric());
        if j > start && ends_word {
            let written: String = chars[i..j].iter().collect();
            if !seen.contains(&written) {
                seen.push(written);
            }
            i = j;
        } else {
            i += 1;
        }
    }
    seen
}

/// A label's name as the Chart Supplement writes it: "HS 1" for "HS1".
pub fn name_of(written: &str) -> String {
    format!("HS {}", written.trim_start_matches("HS").trim())
}

/// Where a point on the page is on the ground, (lat, lon): diagram::place
/// turned back.
pub fn ground(g: &Graticule, x: f64, y: f64) -> (f64, f64) {
    let (u, v) = if g.lat_on_x { (x, y) } else { (y, x) };
    ((u - g.b) / g.a, (v - g.d) / g.c)
}

/// `diagram_hot_spot_labels`: the labels as the text writes them, from
/// `{"text"}`, for the app to find on the page.
pub(super) fn labels_rule(v: &Value) -> Result<String, String> {
    let text = v.get("text").and_then(Value::as_str).ok_or("diagram_hot_spot_labels: \"text\" is missing")?;
    let mut out = String::from("[");
    for (k, s) in labels_in(text).iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, s);
    }
    out.push(']');
    Ok(out)
}

/// `diagram_hot_spots`: `[{"name", "lat", "lon", "x", "y"}]`, from
/// `{"graticule", "labels": [{"text", "x", "y"}]}`, each label at the
/// middle of where it is drawn, points from the page's top left; a text
/// that is not one label is left out.
pub(super) fn spots_rule(v: &Value) -> Result<String, String> {
    let n = "diagram_hot_spots";
    let g = graticule_in(n, v)?;
    let Some(Value::Array(items)) = v.get("labels") else {
        return Err(format!("{n}: \"labels\" is not a list"));
    };
    let mut out = String::from("[");
    let mut first = true;
    for l in items {
        let text = l.get("text").and_then(Value::as_str).unwrap_or("");
        let found = labels_in(text);
        let [written] = found.as_slice() else { continue };
        let (x, y) = (num(n, l, "x")?, num(n, l, "y")?);
        let (lat, lon) = ground(&g, x, y);
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str("{\"name\":");
        json::string(&mut out, &name_of(written));
        for (key, value) in [("lat", lat), ("lon", lon), ("x", x), ("y", y)] {
            out.push_str(&format!(",\"{key}\":"));
            json::number(&mut out, value);
        }
        out.push('}');
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::diagram::{graticule, place};
    use super::*;

    #[test]
    fn labels_are_hs_and_a_number() {
        // KBLV's diagram (cycle 2611, 00046AD) as PDFKit reads its text.
        let text = "REIL Rwy 14L HS 1 HIRL Rwys 14L-32R HS 2 HS 1 HS12 HSX THS 3 HS 123";
        assert_eq!(labels_in(text), vec!["HS 1", "HS 2", "HS12"]);
        assert_eq!(name_of("HS12"), "HS 12");
    }

    #[test]
    fn a_label_goes_back_to_the_ground_it_was_placed_from() {
        // KRFD's north-up graticule, from diagram.rs's test.
        let placed: Vec<(String, f64, f64)> = vec![
            ("42°13'N".into(), 345.9, 76.4),
            ("42°12'N".into(), 345.9, 248.6),
            ("89°07'W".into(), 60.0, 533.6),
            ("89°06'W".into(), 196.0, 533.6),
        ];
        let g = graticule(&placed).unwrap();
        let (x, y) = place(&g, 42.2, -89.1);
        let (lat, lon) = ground(&g, x, y);
        assert!((lat - 42.2).abs() < 1e-9 && (lon + 89.1).abs() < 1e-9);
    }
}
