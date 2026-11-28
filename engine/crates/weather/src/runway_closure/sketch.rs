//! Where the airport card's runway sketch lays each runway
//! (`runway_sketch`), the picture the closed runways' crosses
//! (`runway_closure_marks`) are then placed on: one layout for every app,
//! so a field is drawn the same on the web and the phones.
//!
//! - A runway with both ends surveyed is drawn between them: each end's
//!   position as NASR's APT_RWY_END gives it (LAT_DECIMAL, LONG_DECIMAL;
//!   OurAirports' for a field NASR does not list, as the planner sends
//!   it), in nautical miles east and north of the field's point on the
//!   engine's flat frame (wingtip_core::flat), which is well within a
//!   drawing's error over a field's few thousand feet.
//! - Where no runway of the field has both ends surveyed, each is laid
//!   through the field's point along its first end's true heading
//!   (APT_RWY_END TRUE_ALIGNMENT) for its length (APT_RWY RWY_LEN). That
//!   is a guess for the drawing alone, mostly a one-runway field's, and
//!   says so (`guessed`): the runway's true place on the field is not
//!   known. None is guessed beside a surveyed one, which it might cross
//!   where it does not, nor one within a degree of a heading already
//!   guessed, which would lie on top of it (a field's parallels).
//! - Its drawn width is APT_RWY's RWY_WIDTH, else DEFAULT_WIDTH_FT, an
//!   assumption for the drawing only and no FAA figure.
//! - A runway with fewer than two ends (a helipad) is never drawn, nor
//!   one with neither surveyed ends nor a heading and length to guess by;
//!   the latter are counted (`left_out`) so the card can say the picture
//!   is partial.

use crate::json::{self, Value};
use wingtip_core::flat::Flat;
use wingtip_core::units::FT_PER_NM;

/// The width a runway is drawn at where NASR gives none, feet: an
/// assumption for the drawing only, a paved small field's usual width,
/// so a runway with no width still shows as a strip. No rule reads it.
pub const DEFAULT_WIDTH_FT: f64 = 75.0;

/// How near two guessed headings are taken for one line, degrees.
const PARALLEL_DEG: f64 = 1.0;

/// One end as the planner sends it.
#[derive(Clone, Copy, Default)]
pub struct End {
    pub at: Option<(f64, f64)>,
    pub heading_true_deg: Option<f64>,
}

/// One runway as the sketch reads it: its first two ends, length and width.
#[derive(Clone, Default)]
pub struct Runway {
    pub ends: Vec<End>,
    pub length_ft: Option<f64>,
    pub width_ft: Option<f64>,
}

/// A runway as drawn: which one asked (its index), its ends in nm east and
/// north of the field, its drawn width and whether its place is a guess.
#[derive(Debug, PartialEq)]
pub struct Drawn {
    pub runway: usize,
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub width_ft: f64,
    pub guessed: bool,
}

/// The field's runways laid out about (lat, lon), and how many with two
/// ends were left out.
pub fn sketch(lat: f64, lon: f64, runways: &[Runway]) -> (Vec<Drawn>, usize) {
    let flat = Flat::about(lat, lon);
    let mut surveyed = Vec::new();
    let mut guesses = Vec::new();
    let mut lines: Vec<f64> = Vec::new();
    let paired = runways.iter().filter(|r| r.ends.len() >= 2).count();
    for (i, r) in runways.iter().enumerate() {
        let [first, second] = match r.ends.as_slice() {
            [first, second, ..] => [*first, *second],
            _ => continue,
        };
        let width_ft = r.width_ft.unwrap_or(DEFAULT_WIDTH_FT);
        if let (Some(a), Some(b)) = (first.at, second.at) {
            let (ax, ay) = flat.nm(a.0, a.1);
            let (bx, by) = flat.nm(b.0, b.1);
            surveyed.push(Drawn { runway: i, a: [ax, ay], b: [bx, by], width_ft, guessed: false });
        } else if let (Some(heading), Some(length)) = (first.heading_true_deg, r.length_ft.filter(|l| *l > 0.0)) {
            let line = heading.rem_euclid(180.0);
            if lines.iter().any(|h| (h - line).abs().min(180.0 - (h - line).abs()) < PARALLEL_DEG) {
                continue;
            }
            lines.push(line);
            // The first end is where a landing on it starts: back along its heading.
            let half = length / FT_PER_NM / 2.0;
            let rad = heading * std::f64::consts::PI / 180.0;
            let (dx, dy) = (rad.sin() * half, rad.cos() * half);
            guesses.push(Drawn { runway: i, a: [-dx, -dy], b: [dx, dy], width_ft, guessed: true });
        }
    }
    let drawn = if surveyed.is_empty() { guesses } else { surveyed };
    let left_out = paired.saturating_sub(drawn.len());
    (drawn, left_out)
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// `runway_sketch`: `{"lat", "lon", "runways": [{"runway_ends": [{"lat"?,
/// "lon"?, "heading_true_deg"?}], "length_ft"?, "width_ft"?}]}` to
/// `{"strips": [{"runway", "a", "b", "width_ft", "guessed"}], "left_out"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = wingtip_core::ask::Ask::new(name, v);
    let (lat, lon) = (ask.num("lat")?, ask.num("lon")?);
    let runways: Vec<Runway> = ask
        .list("runways")?
        .iter()
        .map(|r| Runway {
            ends: r
                .get("runway_ends")
                .and_then(Value::as_array)
                .map(|ends| {
                    ends.iter()
                        .map(|e| End { at: num(e, "lat").zip(num(e, "lon")), heading_true_deg: num(e, "heading_true_deg") })
                        .collect()
                })
                .unwrap_or_default(),
            length_ft: num(r, "length_ft"),
            width_ft: num(r, "width_ft"),
        })
        .collect();
    let (drawn, left_out) = sketch(lat, lon, &runways);
    let mut out = String::from("{\"strips\":[");
    for (k, d) in drawn.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str(&format!("{{\"runway\":{},\"a\":[", d.runway));
        point(&mut out, d.a);
        out.push_str("],\"b\":[");
        point(&mut out, d.b);
        out.push_str("],\"width_ft\":");
        json::number(&mut out, d.width_ft);
        out.push_str(&format!(",\"guessed\":{}}}", d.guessed));
    }
    out.push_str(&format!("],\"left_out\":{left_out}}}"));
    Ok(out)
}

/// A point to six places of a nautical mile (under a hundredth of a foot),
/// so an answer reads the same on every host; a rounded -0 is written 0.
fn point(out: &mut String, p: [f64; 2]) {
    let six = |v: f64| (v * 1e6).round() / 1e6 + 0.0;
    json::number(out, six(p[0]));
    out.push(',');
    json::number(out, six(p[1]));
}

#[cfg(test)]
#[path = "sketch_tests.rs"]
mod tests;
