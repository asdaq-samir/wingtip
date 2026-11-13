//! A TFR read for a pilot (`tfr_read`), on the lines a NOTAM's row has
//! (notam_read's what and where; its when is the card's own): what kind it
//! is and the rule it is issued under, how high it reaches, where it is
//! from the field, and its place's name. Read from what tfr.faa.gov gives
//! of it (crate::tfr, the weather service's record): its list's title and
//! kind, and its XNOTAM file's rule, floor and ceiling.
//!
//! The owner, 2026-11-12, of KSJT's card: "TFR" was said twice, and the
//! list's title ("SAN ANGELO, TX, Sunday, November 1, 2026 through
//! Sunday, March 14, 2027 Local") said its dates again beside the card's
//! own Since and Ends: "dates are twice once in the title and then we
//! decode them". So the kind heads the card, the rule beside it, and the
//! title gives only its place.

use super::body;
use crate::contractions::{compass, lookup};
use crate::geo::{bearing_deg, distance_nm};
use crate::json::{self, Value};
use crate::text::grouped_int as grouped;

/// tfr.faa.gov's kinds (its list's LEGAL column, as the weather service
/// keeps it, in title case) in our words, a line each.
const KINDS: &str = concat!(
    "SECURITY:Security\nHAZARDS:Hazard\nVIP:VIP\nSPACE OPERATIONS:Space operations\n",
    "AIR SHOWS/SPORTS:Air show or sports\nUAS PUBLIC GATHERING:Drone\n",
);

/// The rules a TFR is issued under, as crate::tfr names them, and the
/// section a pilot looks them up by: 14 CFR 91.137 to 91.145 and 99.7
/// (eCFR, read 2026-11-12: "§ 99.7 Special security instructions"), and
/// 49 U.S.C. 44812, "Temporary flight restrictions for unmanned aircraft".
fn cited(rule: &str) -> Option<String> {
    let code = crate::tfr::rule_code(rule)?;
    Some(if code == "44812" { "49 U.S.C. 44812".to_owned() } else { ["14 CFR ", code].concat() })
}

/// What it is: "Security TFR", or "TFR" where its kind is not given.
pub fn heading(kind: Option<&str>) -> String {
    let Some(k) = kind.map(str::trim).filter(|k| !k.is_empty()) else { return "TFR".to_owned() };
    let upper = k.to_ascii_uppercase();
    let ours = lookup(KINDS, &upper).map_or_else(|| [&upper[..1], &k[1..].to_ascii_lowercase()].concat(), str::to_owned);
    [ours.as_str(), " TFR"].concat()
}

/// A level as the band says it: "surface" for the ground, "unlimited"
/// for no top, else whole feet and their reference.
fn level(ft: f64, reference: &str, floor: bool) -> (String, &'static str) {
    let r = reference.trim().to_ascii_uppercase();
    // The XNOTAM writes a floor at the surface as 0, AGL or MSL alike: FDC
    // 6/7137's NOTAM says "SFC-7000FT" where its file gives ALT 0 (both
    // read 2026-11-12). Said as surface either way, the wider band.
    if r == "SFC" || (floor && ft <= 0.0) {
        return ("surface".to_owned(), "");
    }
    // And no top as FL999: FDC 6/7129's "SFC-UNL" is 99,900 ft in its file.
    if !floor && ft >= 99_900.0 {
        return ("unlimited".to_owned(), "");
    }
    // Whole feet, rounded outward, the floor down and the ceiling up: a
    // pilot keeps out of the whole band, so it is never said narrower
    // than the TFR's own (the XNOTAM's levels are whole feet; a flight
    // level is crate::tfr's feet).
    let feet = if floor { ft.floor() } else { ft.ceil() } as i64;
    (grouped(feet), if r == "AGL" { "AGL" } else { "MSL" })
}

/// How high it reaches: "3,500 to 18,000 ft MSL", "surface to 3,000 ft
/// AGL", "1,000 ft AGL to 5,000 ft MSL", each reference kept (14 CFR
/// 1.1: MSL against the ground's AGL).
pub fn band(floor: Option<(f64, &str)>, ceiling: Option<(f64, &str)>) -> Option<String> {
    let low = floor.map(|(f, r)| level(f, r, true));
    let high = ceiling.map(|(f, r)| level(f, r, false));
    let said = |(n, r): &(String, &str)| if r.is_empty() { n.clone() } else { [n.as_str(), " ft ", r].concat() };
    Some(match (low, high) {
        (Some((l, lr)), Some((h, hr))) if lr == hr && !hr.is_empty() => [l.as_str(), " to ", &h, " ft ", hr].concat(),
        (Some(l), Some(h)) => [said(&l), " to ".to_owned(), said(&h)].concat(),
        (Some(l), None) => [said(&l), " and above".to_owned()].concat(),
        (None, Some(h)) => ["up to ".to_owned(), said(&h)].concat(),
        (None, None) => return None,
    })
}

/// The 16 points JO 7930.2 3-3-9 gives a direction from a place in, as
/// an obstacle's NOTAM says it ("(9.4NM S SJT)").
const POINTS: [&str; 16] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/// Where it is from the field: "over the field" where its area takes the
/// field in, else how far its nearest edge is and which way, "4.8 nm
/// south of the field", as an obstacle's NOTAM says it. The distance is
/// to a tenth, rounded down: the nearer figure is the safer one to say
/// of an area to keep out of. None where the planner gave neither.
pub fn from_field(over: Option<bool>, field: Option<(f64, f64)>, edge: Option<(f64, f64)>) -> Option<String> {
    if over == Some(true) {
        return Some("over the field".to_owned());
    }
    let ((flat, flon), (elat, elon)) = (field?, edge?);
    let nm = (distance_nm(flat, flon, elat, elon) * 10.0).floor() / 10.0;
    if nm < 0.1 {
        return Some("at the field's edge".to_owned());
    }
    let point = POINTS[((bearing_deg(flat, flon, elat, elon) / 22.5).round() as usize) % 16];
    Some(format!("{nm:.1} nm {} of the field", compass(point)?))
}

/// The weekdays and months tfr.faa.gov's titles give their dates by.
const DATED: [&str; 19] = [
    "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/// The title's place, its dates off (the card says those once, on its
/// Since and Ends lines), written as a name is: "SAN ANGELO, TX, Sunday,
/// November 1, 2026 through ..." as "San Angelo, TX". None where the
/// title is no more than its dates.
pub fn place(title: &str) -> Option<String> {
    let parts: Vec<&str> = title.split(',').map(str::trim).collect();
    let dated = |p: &str| {
        let first = p.split_whitespace().next().unwrap_or("").to_ascii_uppercase();
        DATED.contains(&first.as_str()) || (!first.is_empty() && first.bytes().all(|b| b.is_ascii_digit()))
    };
    let kept: Vec<&str> = parts.iter().take_while(|p| !dated(p)).copied().filter(|p| !p.is_empty()).collect();
    if kept.is_empty() {
        return None;
    }
    let name = kept.join(", ");
    // Capitals are the FAA's own: written as a name (notam_read's body);
    // a title already in mixed case is someone's own writing, kept.
    if name.bytes().any(|b| b.is_ascii_lowercase()) {
        return Some(name);
    }
    Some(body::title(&name.split_whitespace().collect::<Vec<_>>()))
}

fn point(v: Option<&Value>) -> Option<(f64, f64)> {
    let v = v?;
    Some((v.get("lat")?.as_f64()?, v.get("lon")?.as_f64()?))
}

fn level_of(v: &Value, ft: &str, reference: &str) -> Option<(f64, String)> {
    let f = v.get(ft)?.as_f64().filter(|f| f.is_finite())?;
    Some((f, v.get(reference).and_then(Value::as_str).unwrap_or("MSL").to_owned()))
}

/// `tfr_read`: `{"kind", "rule", "title", "floor_ft", "floor_ref",
/// "ceiling_ft", "ceiling_ref", "over_field", "field", "edge"}` (each may
/// be missing) to `{"heading", "what", "where", "place"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "tfr_read" {
        return Err(format!("{name}: not a rule of notam_read"));
    }
    let text = |k: &str| v.get(k).and_then(Value::as_str);
    let heading = heading(text("kind"));
    let what = match text("rule").and_then(cited) {
        Some(rule) => [heading.as_str(), ", ", &rule].concat(),
        None => heading.clone(),
    };
    let floor = level_of(v, "floor_ft", "floor_ref");
    let ceiling = level_of(v, "ceiling_ft", "ceiling_ref");
    let high = band(floor.as_ref().map(|(f, r)| (*f, r.as_str())), ceiling.as_ref().map(|(f, r)| (*f, r.as_str())));
    let over = match v.get("over_field") {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    };
    let from = from_field(over, point(v.get("field")), point(v.get("edge")));
    let place = text("title").and_then(place);
    let where_ = [high, from].into_iter().flatten().collect::<Vec<_>>().join(", ");
    let where_ = (!where_.is_empty()).then(|| [where_[..1].to_ascii_uppercase().as_str(), &where_[1..]].concat());
    let mut out = String::from("{\"heading\":");
    json::string(&mut out, &heading);
    out.push_str(",\"what\":");
    json::string(&mut out, &what);
    out.push_str(",\"where\":");
    json::opt_string(&mut out, where_.as_deref());
    out.push_str(",\"place\":");
    json::opt_string(&mut out, place.as_deref());
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ksjts_security_tfr_says_its_kind_rule_band_and_place_once() {
        let v = json::parse(
            r#"{"kind":"Security","rule":"special security instructions (99.7)","title":"SAN ANGELO, TX, Sunday, November 1, 2026 through Sunday, March 14, 2027 Local","floor_ft":3500,"floor_ref":"MSL","ceiling_ft":18000,"ceiling_ref":"MSL","over_field":true}"#,
        )
        .unwrap();
        let got = call("tfr_read", &v).unwrap();
        assert_eq!(
            got,
            r#"{"heading":"Security TFR","what":"Security TFR, 14 CFR 99.7","where":"3,500 to 18,000 ft MSL, over the field","place":"San Angelo, TX"}"#
        );
    }

    #[test]
    fn a_band_keeps_each_reference_and_says_the_ground_as_surface() {
        assert_eq!(band(Some((0.0, "AGL")), Some((3000.0, "AGL"))).as_deref(), Some("surface to 3,000 ft AGL"));
        assert_eq!(band(Some((0.0, "AGL")), Some((17999.0, "MSL"))).as_deref(), Some("surface to 17,999 ft MSL"));
        assert_eq!(band(Some((1000.0, "AGL")), Some((5000.0, "MSL"))).as_deref(), Some("1,000 ft AGL to 5,000 ft MSL"));
        // The file's 0 MSL is its surface (FDC 6/7137), and FL999 no top (FDC 6/7129).
        assert_eq!(band(Some((0.0, "MSL")), Some((7000.0, "MSL"))).as_deref(), Some("surface to 7,000 ft MSL"));
        assert_eq!(band(Some((0.0, "AGL")), Some((99900.0, "MSL"))).as_deref(), Some("surface to unlimited"));
        // Outward: the floor down, the ceiling up.
        assert_eq!(band(Some((3500.4, "MSL")), Some((17999.2, "MSL"))).as_deref(), Some("3,500 to 18,000 ft MSL"));
        assert_eq!(band(None, None), None);
    }

    #[test]
    fn its_rule_is_the_section_a_pilot_looks_up() {
        assert_eq!(cited("special security instructions (99.7)").as_deref(), Some("14 CFR 99.7"));
        assert_eq!(cited("disaster or hazard (91.137(a)(1))").as_deref(), Some("14 CFR 91.137(a)(1)"));
        assert_eq!(cited("unmanned aircraft near a public gathering").as_deref(), Some("49 U.S.C. 44812"));
        assert_eq!(cited("something new"), None);
        assert_eq!(heading(Some("Hazards")), "Hazard TFR");
        assert_eq!(heading(Some("Air Shows/Sports")), "Air show or sports TFR");
        assert_eq!(heading(None), "TFR");
    }

    #[test]
    fn off_the_field_it_says_how_far_its_edge_is_and_which_way() {
        // Six minutes of latitude due south at 31.3 N is 5.986 nm on WGS-84
        // (core::geo; pyproj's Geod(ellps="WGS84")), said as 5.9 nm: the
        // distance to a TFR's edge is cut to the tenth below, so it is never
        // said as farther than it is.
        let field = (31.35, -100.5);
        let edge = (31.25, -100.5);
        assert_eq!(from_field(Some(false), Some(field), Some(edge)).as_deref(), Some("5.9 nm south of the field"));
        assert_eq!(from_field(Some(true), None, None).as_deref(), Some("over the field"));
        assert_eq!(from_field(None, None, None), None);
    }

    #[test]
    fn its_place_is_the_title_without_its_dates() {
        assert_eq!(place("WASHINGTON, DC, Thursday, January 1, 2026 Local").as_deref(), Some("Washington, DC"));
        assert_eq!(place("Bedminster, NJ, Friday, May 1, 2026 through Sunday, May 3, 2026 Local").as_deref(), Some("Bedminster, NJ"));
        assert_eq!(place("Sunday, November 1, 2026"), None);
    }
}
