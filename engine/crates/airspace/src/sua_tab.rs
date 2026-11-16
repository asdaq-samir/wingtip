//! The tab ForeFlight writes on a special-use area's boundary over the
//! sectional (the owner's screenshot near Brady, TX, 2026-11-12): the
//! area's short name over its limits, "M-BRADY NOR*:" over "3600-17999",
//! along the area's longest side and just inside it. The one copy of the
//! tab's words: the iPhone's map asks it of a phone's pack
//! (view_marks::special_use_in_view), and the charts job asks it by name
//! (`special_use_tab`) for the overlay tiles' `special_use_labels` layer
//! that the web and Android draw (services/jobs/charts/sua_labels.py).
//! The name cut as ForeFlight cuts it, the limits as figures with their
//! references, the tab's finished words (`text`, which the charts job
//! writes into the tiles so a map only draws them), and where the tab
//! sits and how it is turned.
//!
//! The limits are read as crate::sua_limit reads them, and the tab is
//! placed by crate::sua_place.

use crate::json::{self, Value};
use crate::sua_limit::{limit, read_limit, Limit};

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

/// A tab's words: its name and its limits as figures with references.
pub struct Tab {
    pub name: String,
    pub floor: (Option<f64>, &'static str),
    pub ceiling: (Option<f64>, &'static str),
}

/// An area's tab, or None: for a piece the FAA marks EXCLUSION 1 (Brady
/// Low's airspace above 1,500 ft AGL round the two fields it excludes
/// below that), the area's own airspace whose tab would repeat the
/// area's name beside the area's own tab, and where a limit has no figure
/// to write.
pub fn tab(name: &str, type_code: &str, floor: Limit, ceiling: Limit, excluded: bool) -> Option<Tab> {
    if excluded {
        return None;
    }
    let (floor_ft, floor_ref) = limit(floor, false);
    let (ceiling_ft, ceiling_ref) = limit(ceiling, true);
    Some(Tab { name: label_name(name, type_code), floor: (floor_ft, floor_ref?), ceiling: (ceiling_ft, ceiling_ref?) })
}

/// A limit as the tab writes it, as ForeFlight's tabs over the sectional
/// do (the owner's screenshot, 2026-11-12): whole feet with no comma,
/// "7000" MSL, "500AGL" above the ground, "FL230" a flight level, "SFC"
/// and "UNL" (`limit`'s references).
pub fn limit_words(ft: Option<f64>, reference: &str) -> String {
    let whole = |v: f64| v.round() as i64;
    let ft = ft.unwrap_or(0.0);
    match reference {
        "SFC" | "UNL" => reference.to_owned(),
        "AGL" => format!("{}AGL", whole(ft)),
        "FL" => format!("FL{}", whole(ft / 100.0)),
        _ => whole(ft).to_string(),
    }
}

impl Tab {
    /// The tab's words as the map writes them: "M-BRADY NOR*:" over
    /// "3600-17999", the name and its limits on two lines.
    pub fn text(&self) -> String {
        format!("{}:\n{}-{}", self.name, limit_words(self.floor.0, self.floor.1), limit_words(self.ceiling.0, self.ceiling.1))
    }
}

/// The tab's members, `"name","floor_ft","floor_ref","ceiling_ft","ceiling_ref","text"`,
/// with no braces, for an answer to add to.
pub(crate) fn write_words(o: &mut String, t: &Tab) {
    o.push_str("\"text\":");
    json::string(o, &t.text());
    o.push_str(",\"name\":");
    json::string(o, &t.name);
    o.push_str(",\"floor_ft\":");
    json::opt_number(o, t.floor.0);
    o.push_str(",\"floor_ref\":");
    json::string(o, t.floor.1);
    o.push_str(",\"ceiling_ft\":");
    json::opt_number(o, t.ceiling.0);
    o.push_str(",\"ceiling_ref\":");
    json::string(o, t.ceiling.1);
}

/// `special_use_tab`: `{"name", "type", "floor": {"ft", "code", "desc"},
/// "ceiling": {...}, "excluded"}` to the tab's words and `text`, or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let text = |key: &str| v.get(key).and_then(Value::as_str);
    let area = text("name").ok_or_else(|| format!("{name}: \"name\" is not text"))?;
    let (floor, ceiling) = (read_limit(v, "floor"), read_limit(v, "ceiling"));
    Ok(match tab(area, text("type").unwrap_or(""), floor, ceiling, v.get("excluded") == Some(&Value::Bool(true))) {
        None => "null".to_owned(),
        Some(t) => {
            let mut o = String::from("{");
            write_words(&mut o, &t);
            o.push('}');
            o
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sua_limit::lim;

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
    fn an_excluded_piece_has_no_tab() {
        let (floor, ceiling) = (lim(Some(1500.0), "SFC", Some("ANI")), lim(Some(6000.0), "MSL", Some("TNI")));
        assert!(tab("BRADY LOW MOA", "MOA", floor, ceiling, true).is_none());
        let t = tab("BRADY LOW MOA", "MOA", floor, ceiling, false).unwrap();
        assert_eq!((t.name.as_str(), t.floor, t.ceiling), ("M-BRADY LOW", (Some(1501.0), "AGL"), (Some(5999.0), "MSL")));
        assert_eq!(t.text(), "M-BRADY LOW:\n1501AGL-5999");
    }

    #[test]
    fn limits_are_written_in_the_tabs_words() {
        // As ForeFlight's tabs near Brady, TX (the owner's screenshot).
        assert_eq!(limit_words(Some(3600.0), "MSL"), "3600");
        assert_eq!(limit_words(Some(500.0), "AGL"), "500AGL");
        assert_eq!(limit_words(Some(23000.0), "FL"), "FL230");
        assert_eq!(limit_words(Some(0.0), "SFC"), "SFC");
        assert_eq!(limit_words(None, "UNL"), "UNL");
    }
}
