//! A field's way in, as the 3D map stands it up over the ground (the web's
//! features/plan/map/terrain/ApproachGl): each runway's extended
//! centreline on the ground, the glidepath to its threshold in the air,
//! the picked approach's path at its altitudes, and a ring at the
//! traffic pattern's altitude. A picture to fly by, drawn from the FAA's
//! own figures where it has them; every height here is worked out once,
//! for the web, the phones and the planner alike.
//!
//! - The glidepath: the approach's own where the CIFP codes one -- its
//!   vertical angle on the final (ARINC 424-18 5.70, the drawing's
//!   `glidepath_deg`) from its runway's threshold at its threshold
//!   crossing height (the CIFP's runway record, ARINC 424-18 5.67 and
//!   5.68, the drawing's `approach.runway`), or the threshold crossing
//!   altitude the CIFP codes at a runway missed approach point (the
//!   drawing's `runway_path`). Elsewhere the standard: 3.00 degrees, "Use
//!   a standard 3.00-degree GPA where possible" (FAA Order 8260.3G 2-6-3),
//!   the angle a VASI is "normally set at" (AIM 2-1-2), over the threshold
//!   at 40 ft, the recommended TCH of height group 1, general aviation
//!   (FAA Order 8260.3G Table 10-1-1), from the field's elevation -- the
//!   highest point of its usable runways (the Pilot/Controller Glossary),
//!   so a threshold lower than that is drawn under the path, not over it.
//!   Its heights along the way by FAA Order 8260.3G formula 2-6-4 over the
//!   TERPS earth (tags::path_ft), as the approach's tags work theirs.
//! - The centreline: out to the picked approach's final approach fix, else
//!   5 nm, a drawing's length: a VASI's obstacle clearance reaches 4 NM
//!   and a PAPI's 3.4 (AIM 2-1-2), so 5 nm shows the whole of either.
//! - The approach's path: each fix at the altitude its chart has it
//!   crossed at (the lower of a window, ARINC 424-18 5.29, as the
//!   approach's lesson profile draws it), straight between them by
//!   distance, and from the final approach fix down the glidepath. Where
//!   no altitude follows (an LNAV approach's MDA, the plate's alone), the
//!   line stops at the last known one: a guessed height would be worse.
//! - The ring: at the pattern's altitude as the planner gives it (the
//!   FAA's TPA where it publishes one, else 1,000 ft above the field for a
//!   propeller-driven airplane, AIM 4-3-3 and AC 90-66C; brief's
//!   pattern_altitude), round the field as far out as its downwind is
//!   drawn (wingtip_flight's PATTERN_DOWNWIND_NM) past half its longest
//!   runway.

use super::tags::{path_ft, Facts};
use super::{list, num, opt_num, str_or_empty, Drawing, FT_PER_NM, R};
use crate::geo::{bearing_deg, destination, distance_nm};
use crate::json::{self, Value};
use wingtip_flight::limits::PATTERN_DOWNWIND_NM;

/// The glidepath's angle where the FAA publishes none, degrees (FAA Order
/// 8260.3G 2-6-3; AIM 2-1-2's VASI).
pub const STANDARD_GPA_DEG: f64 = 3.0;
/// The threshold crossing height where the FAA publishes none, ft: height
/// group 1's, general aviation (FAA Order 8260.3G Table 10-1-1).
pub const STANDARD_TCH_FT: f64 = 40.0;
/// How far out a centreline and a glidepath are drawn with no approach
/// picked, nm: past a VASI's 4 NM and a PAPI's 3.4 (AIM 2-1-2).
pub const CENTRELINE_NM: f64 = 5.0;
/// A glidepath's points this far apart, nm: the earth's curve in it shows.
const STEP_NM: f64 = 0.25;
/// How near a point of the drawing is to a fix to be it, nm (the planner's
/// wingtip.procedure_paths SAME_PLACE_NM).
const SAME_PLACE_NM: f64 = 0.05;

/// A glidepath's own figures: its threshold, angle, the altitude it
/// crosses the threshold at (ft MSL) and the height above it, where known.
type Own = ((f64, f64), f64, f64, Option<f64>);
/// A centreline: its end, and from the threshold out.
type Centreline = (String, (f64, f64), (f64, f64));

struct End {
    ident: String,
    at: (f64, f64),
    heading_true_deg: Option<f64>,
}

struct Runway {
    length_ft: Option<f64>,
    ends: Vec<End>,
}

/// A glidepath to a runway end: its angle, the height it crosses the
/// threshold at (MSL, and above it where known), whose figures they are,
/// and its points out from the threshold, (lat, lon, ft MSL).
struct Glidepath {
    end: String,
    deg: f64,
    cross_ft: f64,
    tch_ft: Option<f64>,
    source: &'static str,
    points: Vec<(f64, f64, f64)>,
}

fn runways(name: &str, v: &Value) -> R<Vec<Runway>> {
    let mut out = Vec::new();
    for r in list(name, v, "runways")? {
        let mut ends = Vec::new();
        for e in list(name, r, "runway_ends")? {
            // An end NASR gives no place for is not drawn.
            if let (Some(lat), Some(lon)) = (opt_num(name, e, "lat")?, opt_num(name, e, "lon")?) {
                ends.push(End {
                    ident: str_or_empty(name, e, "ident")?.to_uppercase(),
                    at: (lat, lon),
                    heading_true_deg: opt_num(name, e, "heading_true_deg")?,
                });
            }
        }
        out.push(Runway { length_ft: opt_num(name, r, "length_ft")?, ends });
    }
    Ok(out)
}

/// The way out from a threshold along its extended centreline, true: the
/// end's heading turned round, else from the runway's other end on past it.
fn outward(runway: &Runway, end: &End) -> Option<f64> {
    if let Some(h) = end.heading_true_deg {
        return Some((h + 180.0).rem_euclid(360.0));
    }
    let other = runway.ends.iter().find(|e| e.ident != end.ident)?;
    Some(bearing_deg(other.at.0, other.at.1, end.at.0, end.at.1))
}

/// The runway the approach lands on, as NASR names its end ("36", "9L"):
/// the CIFP's runway record's, else its missed approach point's.
fn approach_end(d: &Drawing, facts: &Facts) -> Option<String> {
    let rw = facts
        .runway
        .as_ref()
        .map(|r| r.ident.clone())
        .or_else(|| d.fixes.iter().find(|f| f.has("MAP") && !f.missed && f.ident.starts_with("RW")).map(|f| f.ident.clone()))?;
    Some(rw.trim_start_matches("RW").to_uppercase())
}

fn faf(d: &Drawing) -> Option<(f64, f64)> {
    d.fixes.iter().find(|f| f.has("FAF") && !f.missed).map(|f| (f.lat, f.lon))
}

/// The glidepath's points from `at` out along `bearing` for `nm`.
fn glide_points(at: (f64, f64), bearing: f64, nm: f64, deg: f64, cross_ft: f64) -> Vec<(f64, f64, f64)> {
    let steps = (nm / STEP_NM).ceil().max(1.0) as usize;
    (0..=steps)
        .map(|i| {
            let d = nm * i as f64 / steps as f64;
            let (lat, lon) = destination(at.0, at.1, bearing, d);
            (lat, lon, path_ft(d * FT_PER_NM, deg, cross_ft, 0.0))
        })
        .collect()
}

/// The approach's own glidepath where the CIFP gives its figures: its
/// angle, and its threshold and crossing height or the crossing altitude.
fn published(d: &Drawing, facts: &Facts) -> Option<Own> {
    let deg = d.glidepath_deg.filter(|g| *g > 0.0)?;
    if let Some(r) = &facts.runway {
        return Some(((r.lat, r.lon), deg, r.threshold_ft + r.tch_ft, Some(r.tch_ft)));
    }
    d.runway_path.map(|p| ((p.lat, p.lon), p.deg.abs().max(deg), p.ft, None))
}

/// The approach's line, transition then final, each fix at the altitude
/// it is crossed at and the final down the glidepath (`glide`, the
/// threshold, angle and crossing altitude), between them by distance.
fn approach_path(d: &Drawing, glide: Option<((f64, f64), f64, f64)>) -> Option<Vec<(f64, f64, f64)>> {
    // Each point with how far along it is and its altitude, NaN where none
    // is known: past the final approach fix the glidepath's, else its fix's.
    let faf_at = faf(d);
    let mut pts: Vec<(f64, f64, f64, f64)> = Vec::new();
    let mut down = false;
    let lines = d.lines.iter().filter(|l| l.role == "transition").chain(d.lines.iter().filter(|l| l.role == "final"));
    for p in lines.flat_map(|l| l.points.iter().copied()).chain(glide.map(|(thr, ..)| thr)) {
        let along = match pts.last() {
            // A joint, or the threshold that is the missed approach point: once.
            Some(&(lat, lon, ..)) if distance_nm(lat, lon, p.0, p.1) < SAME_PLACE_NM => continue,
            Some(&(lat, lon, a, _)) => a + distance_nm(lat, lon, p.0, p.1),
            None => 0.0,
        };
        down |= faf_at.is_some_and(|f| distance_nm(p.0, p.1, f.0, f.1) < SAME_PLACE_NM);
        let ft = match glide {
            Some((thr, deg, cross)) if down => path_ft(distance_nm(p.0, p.1, thr.0, thr.1) * FT_PER_NM, deg, cross, 0.0),
            _ => d
                .fixes
                .iter()
                .find(|f| !f.missed && distance_nm(p.0, p.1, f.lat, f.lon) < SAME_PLACE_NM)
                .and_then(|f| f.min_ft.or(f.max_ft))
                .unwrap_or(f64::NAN),
        };
        pts.push((p.0, p.1, along, ft));
    }
    // The unknown between two known by distance, before the first at the
    // first; after the last none, the line stopped there.
    let last = pts.iter().rposition(|p| !p.3.is_nan())?;
    pts.truncate(last + 1);
    let mut prev: Option<usize> = None;
    for j in 0..pts.len() {
        if pts[j].3.is_nan() {
            continue;
        }
        let from = prev.map_or(0, |k| k + 1);
        for i in from..j {
            pts[i].3 = match prev {
                Some(k) => pts[k].3 + (pts[j].3 - pts[k].3) * (pts[i].2 - pts[k].2) / (pts[j].2 - pts[k].2).max(1e-9),
                None => pts[j].3,
            };
        }
        prev = Some(j);
    }
    (pts.len() > 1).then(|| pts.into_iter().map(|p| (p.0, p.1, p.3)).collect())
}

/// The rule `approach_scene` (its contract's x-call) on its input: the field's place, elevation
/// and pattern altitude, its runways, and the approach picked, if any.
pub fn scene(name: &str, v: &Value) -> R<String> {
    let field = (num(name, v, "lat")?, num(name, v, "lon")?);
    let elevation_ft = opt_num(name, v, "elevation_ft")?;
    let pattern_ft = opt_num(name, v, "pattern_ft")?;
    let runways = runways(name, v)?;
    let (drawing, facts) = match v.get("drawing") {
        None | Some(Value::Null) => (None, Facts::default()),
        Some(raw) => (Some(Drawing::read(name, raw)?), Facts::read(name, raw.get("approach"))?),
    };
    let drawing = drawing.filter(|d| d.kind == "approach");
    let landing = drawing.as_ref().and_then(|d| approach_end(d, &facts));
    let own = drawing.as_ref().and_then(|d| published(d, &facts));

    let mut centrelines: Vec<Centreline> = Vec::new();
    let mut glidepaths: Vec<Glidepath> = Vec::new();
    for runway in &runways {
        for end in &runway.ends {
            let Some(out) = outward(runway, end) else { continue };
            let is_landing = landing.as_deref() == Some(end.ident.as_str());
            let to_faf = drawing.as_ref().filter(|_| is_landing).and_then(faf).map(|f| distance_nm(end.at.0, end.at.1, f.0, f.1));
            let nm = to_faf.filter(|n| *n > 0.0).unwrap_or(CENTRELINE_NM);
            centrelines.push((end.ident.clone(), end.at, destination(end.at.0, end.at.1, out, nm)));
            // With an approach picked, its runway's glidepath alone.
            if landing.is_some() && !is_landing {
                continue;
            }
            let path = match own.filter(|_| is_landing) {
                Some((at, deg, cross, tch)) => Some((at, deg, cross, tch, "cifp")),
                None => elevation_ft.map(|e| (end.at, STANDARD_GPA_DEG, e + STANDARD_TCH_FT, Some(STANDARD_TCH_FT), "standard")),
            };
            if let Some((at, deg, cross_ft, tch_ft, source)) = path {
                let points = glide_points(at, out, nm, deg, cross_ft);
                glidepaths.push(Glidepath { end: end.ident.clone(), deg, cross_ft, tch_ft, source, points });
            }
        }
    }
    let glide = own.map(|(at, deg, cross, _)| (at, deg, cross));
    let path = drawing.as_ref().and_then(|d| approach_path(d, glide));
    let longest_ft = runways.iter().filter_map(|r| r.length_ft).fold(0.0, f64::max);
    let ring = pattern_ft.map(|ft| (ft, longest_ft / 2.0 / FT_PER_NM + PATTERN_DOWNWIND_NM));

    let mut out = String::from("{\"centrelines\":[");
    for (i, (end, a, b)) in centrelines.iter().enumerate() {
        out.push_str(if i > 0 { ",{\"end\":" } else { "{\"end\":" });
        json::string(&mut out, end);
        out.push_str(",\"points\":[");
        place(&mut out, a.0, a.1);
        out.push_str("],");
        place(&mut out, b.0, b.1);
        out.push_str("]]}");
    }
    out.push_str("],\"glidepaths\":[");
    for (i, g) in glidepaths.iter().enumerate() {
        out.push_str(if i > 0 { ",{\"end\":" } else { "{\"end\":" });
        json::string(&mut out, &g.end);
        out.push_str(",\"deg\":");
        json::number(&mut out, g.deg);
        out.push_str(",\"cross_ft\":");
        json::number(&mut out, g.cross_ft.round());
        out.push_str(",\"tch_ft\":");
        json::opt_number(&mut out, g.tch_ft);
        out.push_str(",\"source\":\"");
        out.push_str(g.source);
        out.push_str("\",\"points\":");
        aloft(&mut out, &g.points);
        out.push('}');
    }
    out.push_str("],\"path\":");
    match &path {
        Some(p) => aloft(&mut out, p),
        None => out.push_str("null"),
    }
    // The ring as its middle and its radius: the apps draw it round.
    out.push_str(",\"ring\":");
    match ring {
        Some((ft, radius_nm)) => {
            out.push_str("{\"ft\":");
            json::number(&mut out, ft);
            out.push_str(",\"radius_nm\":");
            json::number(&mut out, (radius_nm * 1000.0).round() / 1000.0);
            out.push_str(",\"center\":[");
            place(&mut out, field.0, field.1);
            out.push_str("]}");
        }
        None => out.push_str("null"),
    }
    out.push('}');
    Ok(out)
}

/// A place's latitude and longitude, to six places of a degree (about
/// 0.1 m), with a comma between.
fn place(out: &mut String, lat: f64, lon: f64) {
    json::number(out, (lat * 1e6).round() / 1e6);
    out.push(',');
    json::number(out, (lon * 1e6).round() / 1e6);
}

/// Points in the air, [lat, lon, ft MSL], the feet whole.
fn aloft(out: &mut String, points: &[(f64, f64, f64)]) {
    out.push('[');
    for (i, p) in points.iter().enumerate() {
        out.push_str(if i > 0 { ",[" } else { "[" });
        place(out, p.0, p.1);
        out.push(',');
        json::number(out, p.2.round());
        out.push(']');
    }
    out.push(']');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_standard_glidepath_rises_about_318_ft_a_mile() {
        // tan 3° x 6,076 ft = 318.4 ft a nautical mile, over the threshold
        // at 40 ft; the TERPS earth's curve adds under a foot at 1 nm.
        let p = glide_points((40.0, -90.0), 180.0, 1.0, STANDARD_GPA_DEG, 1000.0 + STANDARD_TCH_FT);
        assert_eq!(p.first().unwrap().2, 1040.0);
        let top = p.last().unwrap().2;
        assert!((top - 1358.4).abs() < 1.5, "{top}");
    }
}
