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
//! The limits are read from the FAA's special use airspace data (AIS's
//! Special_Use_Airspace layer on ADDS, published every eight weeks; its
//! metadata, read 2026-11-12 for 29 Oct to 24 Dec 2026, names the fields
//! but not their values): LOWER_/UPPER_VAL with its UOM (FT, or FL, a
//! flight level), LOWER_/UPPER_CODE (SFC, MSL, STD for a flight level,
//! UNLTD), LOWER_/UPPER_DESC (TI to and including, TNI to but not
//! including, ANI above but not including; the only values the layer
//! holds besides OTHER and none, and read so because the FAA's CIFP
//! writes the same areas' limits that way, below) and EXCLUSION, which
//! the metadata does not define either. The data shows what 1 is: the
//! area's own airspace over a part the FAA excludes lower down, drawn as
//! its own polygon with its area's NAME and its own floor, the area's
//! main polygon cut around it. Brady Low MOA (500 FT SFC to 6,000 MSL
//! TNI) has two, round Curtis Field and San Saba County, 1,500 FT SFC
//! ANI to 6,000 MSL TNI, each with the REMARKS "EXCLUDES SFC TO 1500 FT
//! AGL" (ADDS, queried 2026-11-12): the MOA is there above 1,500 ft AGL,
//! not under it. As wingtip.sua `_area` keeps them in a pack.

use crate::json::{self, Value};
use crate::rules::CLASS_A_FLOOR_FT;
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

/// One limit as the FAA's data gives it: the figure in feet (a flight
/// level already times 100, wingtip.sua `_height_ft`), its CODE and its
/// DESC.
#[derive(Clone, Copy, Default)]
pub struct Limit<'a> {
    pub ft: Option<f64>,
    pub code: Option<&'a str>,
    pub desc: Option<&'a str>,
}

/// A floor or ceiling as the tab writes it, (feet, reference), written as
/// the FAA's own CIFP (FAACIFP18, ARINC 424's restrictive airspace record,
/// each limit with M for MSL or A for AGL) writes the same areas, which is
/// how ForeFlight writes them (cycle 2610, read 2026-11-12):
///
/// - "UNL" for no ceiling (UNLTD), with no figure.
/// - "SFC" at the surface; a height the FAA codes SFC above 0 is that
///   height above the ground, "AGL" (Brady Low's 500 FT SFC, CIFP's
///   "00500A").
/// - "FL" for a flight level (STD, standard pressure, 14 CFR 1.1); but a
///   ceiling at FL180 "to but not including" is 17,999 ft MSL, CIFP's
///   "17999M" (Brady North): below 18,000 ft MSL, where Class A begins
///   (14 CFR 71.33(a), "from 18,000 feet MSL"), altitudes are MSL. A higher flight level is written
///   as it is: a flight level has no foot below it to write.
/// - Otherwise "MSL", or "AGL" as coded; a ceiling TNI a foot under its
///   figure and a floor ANI a foot over it, as CIFP writes them (Brady
///   Low's 6,000 TNI "05999M", its pieces above 1,500 AGL "01501A").
///
/// (None, None) where there is no figure to write.
pub fn limit(limit: Limit, upper: bool) -> (Option<f64>, Option<&'static str>) {
    let code = limit.code.unwrap_or("").trim().to_uppercase();
    if code == "UNLTD" {
        return (None, Some("UNL"));
    }
    let Some(ft) = limit.ft.filter(|v| v.is_finite()) else { return (None, None) };
    let desc = limit.desc.unwrap_or("").trim().to_uppercase();
    let step = match (upper, desc.as_str()) {
        (true, "TNI") => -1.0,
        (false, "ANI") => 1.0,
        _ => 0.0,
    };
    match code.as_str() {
        "STD" if upper && step != 0.0 && ft == CLASS_A_FLOOR_FT => (Some(ft + step), Some("MSL")),
        "STD" => (Some(ft), Some("FL")),
        "SFC" if ft == 0.0 && step == 0.0 => (Some(0.0), Some("SFC")),
        "SFC" | "AGL" => (Some(ft + step), Some("AGL")),
        _ => (Some(ft + step), Some("MSL")),
    }
}

/// A special-use area's floor and ceiling for the alerts ahead
/// (crate::ahead), from the
/// figures and the area's codes and DESC as wingtip.sua `_area` keeps
/// them (`floor_ref`, `floor_desc`, `ceiling_ref`, `ceiling_desc`), else
/// the codes a pack's `sua.alt` keeps (`refs`, wingtip.cycle_pack
/// `_SUA_REFS`: 1 SFC, 2 AGL, 3 MSL, 0 STD, UNLTD or none, which an absent
/// figure or MSL reads as rightly). A figure not a number is none. Read as its tab reads them (`limit`,
/// the one reading of the FAA's special use airspace data): a figure the
/// FAA codes SFC above 0 is that height above the ground (Brady Low MOA's
/// 500 FT SFC is CIFP's "00500A"), a ceiling "to but not including" a foot
/// under its figure and a floor "above but not including" a foot over it.
/// Read as MSL, as the alerts read them before 2026-11-12, Brady Low's
/// pieces round Curtis Field and San Saba County (1,500 FT SFC ANI,
/// REMARKS "EXCLUDES SFC TO 1500 FT AGL") began at 1,500 ft MSL, under
/// the ground there, and alerted a pilot below the MOA where the FAA
/// excludes it. No ceiling (UNLTD) is none; a limit with no figure is
/// none, as before.
pub fn heights(codes: Option<&Value>, floor_ft: Option<f64>, ceiling_ft: Option<f64>, refs: [u8; 2]) -> Heights {
    let pack_code = |byte: u8| match byte {
        1 => Some("SFC"),
        2 => Some("AGL"),
        3 => Some("MSL"),
        _ => None,
    };
    let text = |key: &str| codes.and_then(|c| c.get(key)).and_then(Value::as_str);
    let (floor, floor_ref) = limit(Limit { ft: floor_ft, code: text("floor_ref").or(pack_code(refs[0])), desc: text("floor_desc") }, false);
    let (ceiling, ceiling_ref) =
        limit(Limit { ft: ceiling_ft, code: text("ceiling_ref").or(pack_code(refs[1])), desc: text("ceiling_desc") }, true);
    Heights { floor, floor_agl: floor_ref == Some("AGL"), ceiling, ceiling_agl: ceiling_ref == Some("AGL") }
}

/// A special-use area's floor and ceiling in feet, each with whether it
/// is above the ground (else MSL, a flight level as its feet); None where
/// there is no figure.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Heights {
    pub floor: Option<f64>,
    pub floor_agl: bool,
    pub ceiling: Option<f64>,
    pub ceiling_agl: bool,
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

/// The `{"ft", "code", "desc"}` limit under `key`; none is no figure.
pub fn read_limit<'a>(v: &'a Value, key: &str) -> Limit<'a> {
    let at = |k: &str| v.get(key).filter(|o| !matches!(o, Value::Null)).and_then(|o| o.get(k));
    Limit { ft: at("ft").and_then(Value::as_f64), code: at("code").and_then(Value::as_str), desc: at("desc").and_then(Value::as_str) }
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
    fn the_alerts_read_sfc_above_the_ground_from_the_json_or_the_packs_codes() {
        // Brady Low MOA's piece round Curtis Field as ADDS has it
        // (2026-11-12): 1,500 SFC ANI to 6,000 MSL TNI, EXCLUSION 1,
        // REMARKS "EXCLUDES SFC TO 1500 FT AGL".
        let piece =
            json::parse(r#"{"floor_ref":"SFC","floor_desc":"ANI","ceiling_ref":"MSL","ceiling_desc":"TNI","excluded":true}"#).unwrap();
        let want = Heights { floor: Some(1501.0), floor_agl: true, ceiling: Some(5999.0), ceiling_agl: false };
        assert_eq!(heights(Some(&piece), Some(1500.0), Some(6000.0), [0, 0]), want);
        // A pack with no JSON: its sua.alt codes (1 SFC, 3 MSL), no DESC.
        let coded = Heights { floor: Some(1500.0), floor_agl: true, ceiling: Some(6000.0), ceiling_agl: false };
        assert_eq!(heights(None, Some(1500.0), Some(6000.0), [1, 3]), coded);
        // The surface is the ground itself; no ceiling (UNLTD, NaN in a pack) is none.
        let surface = Heights { floor: Some(0.0), floor_agl: false, ceiling: None, ceiling_agl: false };
        assert_eq!(heights(None, Some(0.0), Some(f64::NAN), [1, 0]), surface);
    }

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

    fn lim<'a>(ft: Option<f64>, code: &'a str, desc: Option<&'a str>) -> Limit<'a> {
        Limit { ft, code: Some(code), desc }
    }

    #[test]
    fn limits_are_written_as_the_faas_cifp_writes_them() {
        // Brady North's FL180 TNI: CIFP's "17999M" (Class A, 14 CFR 71.33).
        assert_eq!(limit(lim(Some(18000.0), "STD", Some("TNI")), true), (Some(17999.0), Some("MSL")));
        assert_eq!(limit(lim(Some(18000.0), "STD", Some("TI")), true), (Some(18000.0), Some("FL")));
        assert_eq!(limit(lim(Some(23000.0), "STD", Some("TNI")), true), (Some(23000.0), Some("FL")));
        // Brady Low's 6,000 MSL TNI, "05999M", over 500 FT SFC, "00500A".
        assert_eq!(limit(lim(Some(6000.0), "MSL", Some("TNI")), true), (Some(5999.0), Some("MSL")));
        assert_eq!(limit(lim(Some(500.0), "SFC", None), false), (Some(500.0), Some("AGL")));
        // Its pieces above but not including 1,500 AGL, "01501A".
        assert_eq!(limit(lim(Some(1500.0), "SFC", Some("ANI")), false), (Some(1501.0), Some("AGL")));
        // TNI on a floor and ANI on a ceiling say nothing of the figure.
        assert_eq!(limit(lim(Some(3600.0), "MSL", Some("TNI")), false), (Some(3600.0), Some("MSL")));
        assert_eq!(limit(lim(Some(0.0), "SFC", None), false), (Some(0.0), Some("SFC")));
        // A pack with no DESC: the figure as coded.
        assert_eq!(limit(lim(Some(18000.0), "STD", None), true), (Some(18000.0), Some("FL")));
        assert_eq!(limit(lim(None, "UNLTD", None), true), (None, Some("UNL")));
        assert_eq!(limit(lim(None, "MSL", None), true), (None, None));
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
