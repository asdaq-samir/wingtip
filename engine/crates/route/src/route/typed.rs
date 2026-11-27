//! A route typed or pasted, read once for the web's route box (readTyped)
//! and the phones' Type Route (TypedRoute), which each read it word by
//! word themselves: each word as item 15 of a flight plan has it (AIM
//! Appendix 4; wingtip_flight's route_read: DCT out, a speed and level
//! group the cruise asked for), a position's "@42.1,-88.2" kept whole
//! (the reader would split it on its comma), the SIDs and STARs among
//! the words (route_procedures: AIM 5-2-9, 5-4-1), which are the route's
//! procedures, not points, and the rest the points whose form is a stop's
//! (points::kind: a fix's or a field's ident, the pilot's own point off a
//! fix). Where the words end in a procedure the route goes on past the
//! last point: a STAR comes before its field, still to be typed.

use super::points;
use crate::json::{self, Value};
use wingtip_flight::route_read;

/// What the words say.
#[derive(Debug, Default, PartialEq)]
pub struct Typed {
    /// The words read, a level group and DCT taken out, uppercased.
    pub words: Vec<String>,
    /// The points among them, in order, each a stop's form.
    pub points: Vec<String>,
    /// The SIDs and STARs among them, each with the point before and after.
    pub procedures: Vec<(String, Option<String>, Option<String>)>,
    /// The cruise the first level group asked for, feet.
    pub cruise_ft: Option<f64>,
    /// The words end in a procedure, its field still to come.
    pub goes_on: bool,
}

/// The words typed, read; procedures among them only `with_procedures`
/// (where the caller has somewhere to send them), else every word a point.
pub fn read(typed: &[&str], with_procedures: bool) -> Typed {
    let mut cruise_ft = None;
    let mut words = Vec::new();
    for word in typed.iter().map(|w| w.trim().to_uppercase()).filter(|w| !w.is_empty()) {
        if word.contains(',') {
            words.push(word);
            continue;
        }
        let r = route_read::read(&word);
        cruise_ft = cruise_ft.or(r.cruise_ft);
        words.extend(r.points);
    }
    let refs: Vec<&str> = words.iter().map(String::as_str).collect();
    let procedures = if with_procedures { route_read::procedures(&refs) } else { Vec::new() };
    let named = |w: &str| procedures.iter().any(|(name, _, _)| name == w);
    let points = words.iter().filter(|w| !named(w) && points::kind(w).is_some()).cloned().collect();
    let goes_on = words.last().is_some_and(|w| named(w));
    Typed { words, points, procedures, cruise_ft, goes_on }
}

/// `route_typed`: `{"words": [string], "procedures"?: bool}` (true unless
/// false) to `{"words", "points", "procedures": [{"name", "before",
/// "after"}], "cruise_ft", "goes_on"}`.
pub fn answer(name: &str, v: &Value) -> Result<String, String> {
    let typed: Vec<&str> = match v.get("words") {
        Some(Value::Array(list)) => list
            .iter()
            .map(|w| w.as_str().ok_or_else(|| format!("{name}: \"words\" is not a list of strings")))
            .collect::<Result<_, _>>()?,
        _ => return Err(format!("{name}: \"words\" is missing or not a list")),
    };
    let with_procedures = !matches!(v.get("procedures"), Some(Value::Bool(false)));
    let t = read(&typed, with_procedures);
    let list = |out: &mut String, items: &[String]| {
        out.push('[');
        for (i, w) in items.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            json::string(out, w);
        }
        out.push(']');
    };
    let mut out = String::from("{\"words\":");
    list(&mut out, &t.words);
    out.push_str(",\"points\":");
    list(&mut out, &t.points);
    out.push_str(",\"procedures\":");
    route_read::write_procedures(&t.procedures, &mut out);
    out.push_str(",\"cruise_ft\":");
    json::opt_number(&mut out, t.cruise_ft);
    out.push_str(&format!(",\"goes_on\":{}}}", t.goes_on));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_filed_route_its_procedures_and_its_points() {
        let t = read(&["kmsp", "BAEE1", "BAE", "OSH", "OSHH2", "KATW"], true);
        assert_eq!(t.points, ["KMSP", "BAE", "OSH", "KATW"]);
        assert_eq!(t.procedures[0], ("BAEE1".to_owned(), Some("KMSP".to_owned()), Some("BAE".to_owned())));
        assert!(!t.goes_on);
        // Ending in a STAR, its field still to come.
        assert!(read(&["OSH", "OSHH2"], true).goes_on);
        // With nowhere to send them, procedures are points.
        assert_eq!(read(&["BAEE1", "BAE"], false).points, ["BAEE1", "BAE"]);
        // A position kept whole, but no stop's form.
        assert_eq!(read(&["@42.1,-88.2", "KDLH"], true).words, ["@42.1,-88.2", "KDLH"]);
        assert_eq!(read(&["@42.1,-88.2", "KDLH"], true).points, ["KDLH"]);
    }
}
