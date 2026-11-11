//! The tags an approach's fixes carry on the map, ForeFlight's way (the
//! owner, 2026-11-11): each fix's name, the altitude it is crossed at and
//! how (at, at or above, at or below, between), the glide slope's or the
//! glidepath's altitude at the final approach fix, and the runway's
//! threshold crossing height and touchdown zone elevation at a missed
//! approach point that is the runway; and the final approach segment, from
//! the final approach fix to the missed approach point, for the map to
//! mark. The apps draw what this answers and write the figures their way.
//!
//! Read from the procedure as the planner draws it from the FAA's CIFP
//! (wingtip.procedures.procedure_drawing) with the CIFP's own figures for
//! the approach (`approach`, wingtip.approach_facts):
//!
//! - the glide slope's altitude at the final approach fix is the CIFP's
//!   own, the second altitude of a fix whose altitude description is "G"
//!   or "H" (ARINC 424-18 5.29: the glide slope altitude, MSL, on the FAF
//!   of a precision approach with an electronic glide slope) -- KOSH's ILS
//!   RWY 36: POBER, at or above 2,700, GS 2,610, as the plate prints it;
//! - an RNAV approach's glidepath at its final approach fix, which the CIFP
//!   does not code there, is worked out from the glidepath's angle, the
//!   threshold's elevation and its crossing height by FAA Order 8260.3G's
//!   formula 2-6-4 (the vertical path's altitude at a fix, over the TERPS
//!   earth of Appendix D), and said to be worked out (`source`). Only for
//!   an approach with vertically guided minimums authorised in the CIFP
//!   (LPV or LNAV/VNAV, ARINC 424-19 5.275 and 5.276): an LNAV approach's
//!   vertical descent angle is advisory, not a glidepath (AIM 5-4-5).
//! - No decision altitude or MDA: the minimums are the plate's alone (the
//!   d-TPP), in no FAA data set a program can read, and a guessed one is
//!   worse than none. The runway's threshold crossing height (the CIFP's
//!   runway record, ARINC 424-18 5.67) and touchdown zone elevation
//!   (NASR's APT_RWY_END TDZ_ELEV; the highest elevation in the first
//!   3,000 ft of the landing surface, the Pilot/Controller Glossary) are
//!   shown at the runway instead.

use super::{list, num, opt_num, str_or_empty, Drawing, Fix, R};
use crate::json::{self, Value};

/// The TERPS constant for the earth's mean radius in spherical
/// calculations, feet (FAA Order 8260.3G, Appendix D, 1.b(2)).
pub const TERPS_EARTH_FT: f64 = 20_890_537.0;
/// WGS-84's semi-major axis, metres, and its first eccentricity squared
/// (NIMA TR8350.2, table 3.1 and 7.1): the FAA's fixes are on WGS-84.
const WGS84_A_M: f64 = 6_378_137.0;
const WGS84_E2: f64 = 0.006_694_379_990_14;
/// Feet in a metre, exactly (the international foot, 0.3048 m).
const FT_PER_M: f64 = 1.0 / 0.3048;

/// The CIFP's own altitude coded at a fix beside its limits: the glide
/// slope's at the final approach fix ("G", "H"), the glide slope's
/// intercept at the final approach course fix ("I", "J"), or the vertical
/// path's at a step-down fix ("V"), ARINC 424-18 5.29.
#[derive(Clone, Debug, PartialEq)]
pub struct Coded {
    pub fix: String,
    pub code: String,
    pub ft: f64,
}

/// The approach's runway as the CIFP's runway record and NASR give it.
#[derive(Clone, Debug, PartialEq)]
pub struct Runway {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    /// The landing threshold's elevation, ft MSL (ARINC 424-18 5.68).
    pub threshold_ft: f64,
    /// The threshold crossing height, ft above it (ARINC 424-18 5.67).
    pub tch_ft: f64,
    /// The touchdown zone elevation, ft MSL, to a tenth (NASR TDZ_ELEV).
    pub tdze_ft: Option<f64>,
}

/// What the CIFP says of the approach besides its legs (the drawing's
/// `approach`, wingtip.approach_facts).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Facts {
    pub runway: Option<Runway>,
    pub coded: Vec<Coded>,
    /// The levels of service authorised: "LPV", "LNAV/VNAV", "LNAV", ...
    pub levels: Vec<String>,
}

impl Facts {
    pub fn read(name: &str, v: Option<&Value>) -> R<Facts> {
        let Some(v @ Value::Object(_)) = v else { return Ok(Facts::default()) };
        let runway = match v.get("runway") {
            Some(r @ Value::Object(_)) => Some(Runway {
                ident: str_or_empty(name, r, "ident")?,
                lat: num(name, r, "lat")?,
                lon: num(name, r, "lon")?,
                threshold_ft: num(name, r, "threshold_ft")?,
                tch_ft: num(name, r, "tch_ft")?,
                tdze_ft: opt_num(name, r, "tdze_ft")?,
            }),
            _ => None,
        };
        let coded = list(name, v, "coded")?
            .iter()
            .map(|c| Ok(Coded { fix: str_or_empty(name, c, "fix")?, code: str_or_empty(name, c, "code")?, ft: num(name, c, "ft")? }))
            .collect::<R<_>>()?;
        let levels = list(name, v, "levels")?.iter().filter_map(|l| l.as_str().map(str::to_owned)).collect();
        Ok(Facts { runway, coded, levels })
    }
}

/// How a fix is to be crossed, from its limits (ARINC 424-18 5.29, as the
/// drawing gives them): at both where they are one, at or above the lower
/// alone, at or below the upper alone, between the two.
pub fn sense(min_ft: Option<f64>, max_ft: Option<f64>) -> Option<&'static str> {
    match (min_ft, max_ft) {
        (Some(lo), Some(hi)) if lo == hi => Some("at"),
        (Some(_), Some(_)) => Some("between"),
        (Some(_), None) => Some("at_or_above"),
        (None, Some(_)) => Some("at_or_below"),
        (None, None) => None,
    }
}

/// The distance between two nearby points on WGS-84, feet: the meridian's
/// and the prime vertical's radii of curvature at their mean latitude
/// (NIMA TR8350.2, 4.2), true to a foot over a final's few miles, where
/// the engine's sphere (crate::geo) may be a few hundredths of a mile off.
pub fn ellipsoid_ft(a: (f64, f64), b: (f64, f64)) -> f64 {
    let lat = ((a.0 + b.0) / 2.0).to_radians();
    let w = (1.0 - WGS84_E2 * lat.sin().powi(2)).sqrt();
    let meridian = WGS84_A_M * (1.0 - WGS84_E2) / w.powi(3);
    let vertical = WGS84_A_M / w;
    let dy = (b.0 - a.0).to_radians() * meridian;
    let dx = (b.1 - a.1).to_radians() * vertical * lat.cos();
    dy.hypot(dx) * FT_PER_M
}

/// The vertical path's altitude at a fix `d_ft` from the landing threshold
/// point, ft MSL: FAA Order 8260.3G formula 2-6-4, Z = e^(D·tan θ / r) ×
/// (r + THRe + TCH) − r, r the TERPS earth (Appendix D). Held to the CIFP's
/// own vertical path altitudes at RNAV finals' step-down fixes (KOSH RNAV
/// (GPS) RWY 36's JUMVO: 1,467 coded, 1,466.5 worked out).
pub fn path_ft(d_ft: f64, deg: f64, threshold_ft: f64, tch_ft: f64) -> f64 {
    (d_ft * deg.to_radians().tan() / TERPS_EARTH_FT).exp() * (TERPS_EARTH_FT + threshold_ft + tch_ft) - TERPS_EARTH_FT
}

/// Whether the approach has a glidepath to show at its final approach fix
/// worked out: an RNAV (GPS), RNAV (RNP) or GLS approach by its CIFP id's
/// route type (ARINC 424-18 5.10: "R", "P", "H", "J") with vertically
/// guided minimums authorised (LPV or LNAV/VNAV; an RNP's are always).
fn vertically_guided(id: &str, levels: &[String]) -> bool {
    match id.as_bytes().first() {
        Some(b'H' | b'J') => true,
        Some(b'R' | b'P') => levels.iter().any(|l| l == "LPV" || l == "LNAV/VNAV"),
        _ => false,
    }
}

/// A whole foot as the d-TPP prints an elevation: NASR's tenths rounded
/// half up (KOSH runway 36's 808.5, 809 on the plate).
fn whole_ft(ft: f64) -> f64 {
    (ft + 0.5).floor()
}

struct Vertical {
    kind: &'static str,
    ft: f64,
    deg: Option<f64>,
    source: &'static str,
}

fn vertical_at(d: &Drawing, facts: &Facts, fix: &Fix) -> Option<Vertical> {
    if !fix.has("FAF") || fix.missed {
        return None;
    }
    if let Some(c) = facts.coded.iter().find(|c| c.fix == fix.ident && (c.code == "G" || c.code == "H")) {
        return Some(Vertical { kind: "glideslope", ft: c.ft, deg: d.glidepath_deg, source: "cifp" });
    }
    let (deg, runway) = (d.glidepath_deg?, facts.runway.as_ref()?);
    if !vertically_guided(&d.id, &facts.levels) || deg <= 0.0 {
        return None;
    }
    let ft = path_ft(ellipsoid_ft((fix.lat, fix.lon), (runway.lat, runway.lon)), deg, runway.threshold_ft, runway.tch_ft);
    Some(Vertical { kind: "glidepath", ft: ft.round(), deg: Some(deg), source: "computed" })
}

fn tag_json(out: &mut String, d: &Drawing, facts: &Facts, fix: &Fix) {
    out.push_str("{\"ident\":");
    json::string(out, &fix.ident);
    out.push_str(",\"lat\":");
    json::number(out, fix.lat);
    out.push_str(",\"lon\":");
    json::number(out, fix.lon);
    out.push_str(",\"roles\":[");
    for (i, r) in fix.roles.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, r);
    }
    out.push_str("],\"missed\":");
    out.push_str(if fix.missed { "true" } else { "false" });
    out.push_str(",\"altitude\":");
    match sense(fix.min_ft, fix.max_ft) {
        Some(s) => {
            out.push_str("{\"sense\":");
            json::string(out, s);
            out.push_str(",\"min_ft\":");
            json::opt_number(out, fix.min_ft);
            out.push_str(",\"max_ft\":");
            json::opt_number(out, fix.max_ft);
            out.push('}');
        }
        None => out.push_str("null"),
    }
    out.push_str(",\"vertical\":");
    match vertical_at(d, facts, fix) {
        Some(v) => {
            out.push_str("{\"kind\":");
            json::string(out, v.kind);
            out.push_str(",\"ft\":");
            json::number(out, v.ft);
            out.push_str(",\"deg\":");
            json::opt_number(out, v.deg);
            out.push_str(",\"source\":");
            json::string(out, v.source);
            out.push('}');
        }
        None => out.push_str("null"),
    }
    out.push_str(",\"runway\":");
    match facts.runway.as_ref().filter(|r| fix.has("MAP") && !fix.missed && r.ident == fix.ident) {
        Some(r) => {
            out.push_str("{\"threshold_ft\":");
            json::number(out, r.threshold_ft);
            out.push_str(",\"tch_ft\":");
            json::number(out, r.tch_ft);
            out.push_str(",\"tdze_ft\":");
            json::opt_number(out, r.tdze_ft.map(whole_ft));
            out.push('}');
        }
        None => out.push_str("null"),
    }
    out.push('}');
}

/// The rule `approach_fix_tags` on its input, {"drawing": ...}.
pub fn fix_tags(name: &str, v: &Value) -> R<String> {
    let raw = v.get("drawing").ok_or_else(|| format!("{name}: \"drawing\" is missing"))?;
    let d = Drawing::read(name, raw)?;
    let facts = Facts::read(name, raw.get("approach"))?;
    let mut out = String::from("{\"tags\":[");
    // A fix crossed twice (a missed approach's hold back at an IAF) is one
    // tag, as the drawing keeps it.
    for (i, fix) in d.fixes.iter().filter(|f| !f.ident.is_empty()).enumerate() {
        if i > 0 {
            out.push(',');
        }
        tag_json(&mut out, &d, &facts, fix);
    }
    out.push_str("],\"final\":");
    let faf = d.fixes.iter().find(|f| f.has("FAF") && !f.missed);
    let map = d.fixes.iter().find(|f| f.has("MAP") && !f.missed);
    match (faf, map) {
        (Some(a), Some(b)) => {
            out.push_str("{\"from\":");
            json::string(&mut out, &a.ident);
            out.push_str(",\"to\":");
            json::string(&mut out, &b.ident);
            out.push_str(",\"points\":[[");
            json::number(&mut out, a.lat);
            out.push(',');
            json::number(&mut out, a.lon);
            out.push_str("],[");
            json::number(&mut out, b.lat);
            out.push(',');
            json::number(&mut out, b.lon);
            out.push_str("]]}");
        }
        _ => out.push_str("null"),
    }
    out.push('}');
    Ok(out)
}

/// The rules by name this module answers.
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        "approach_fix_tags" => fix_tags(name, v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fix_is_crossed_at_above_below_or_between() {
        assert_eq!(sense(Some(2700.0), Some(2700.0)), Some("at"));
        assert_eq!(sense(Some(2700.0), None), Some("at_or_above"));
        assert_eq!(sense(None, Some(5000.0)), Some("at_or_below"));
        assert_eq!(sense(Some(3000.0), Some(5000.0)), Some("between"));
        assert_eq!(sense(None, None), None);
    }

    #[test]
    fn the_vertical_path_at_a_step_down_fix_is_the_cifps() {
        // KOSH RNAV (GPS) RWY 36 (CIFP 2026-10-29): JUMVO, N43°55'55.82"
        // W088°33'25.67", 3.00° to RW36, N43°57'49.82" W088°33'24.18",
        // threshold 808 ft, TCH 53: the CIFP codes 1,467 ("V", 01467).
        let jumvo = (43.0 + 55.0 / 60.0 + 55.82 / 3600.0, -(88.0 + 33.0 / 60.0 + 25.67 / 3600.0));
        let rw36 = (43.0 + 57.0 / 60.0 + 49.82 / 3600.0, -(88.0 + 33.0 / 60.0 + 24.18 / 3600.0));
        let ft = path_ft(ellipsoid_ft(jumvo, rw36), 3.0, 808.0, 53.0);
        assert!((ft - 1467.0).abs() < 1.5, "{ft}");
    }

    #[test]
    fn elevations_round_half_up_as_the_plate_prints_them() {
        assert_eq!(whole_ft(808.5), 809.0);
        assert_eq!(whole_ft(808.4), 808.0);
    }
}
