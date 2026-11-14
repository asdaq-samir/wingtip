//! Own ship's still-air glide (the web's lib/map/glide): the ring on the
//! map, the fields in reach on the Nearest card, and whether the airplane
//! is moving at flying speed at all.

use super::{num, opt};
use crate::geo::destination;
use crate::json::{self, Value};

// The figures themselves are procedures' (figures::glide), which the
// emergency's best fields glide by too; here by the names they had.
pub use crate::figures::glide::{nm_per_1000_ft, range_nm, reaches, underway, AIRBORNE_AGL_FT, ARRIVE_AGL_FT};

/// The ring's points: one every five degrees, round to a smooth circle at
/// any zoom a pilot reads it at.
pub const RING_POINTS: usize = 72;

/// A glide ring: its range, nm, the ground it is reckoned over, ft, and
/// its outline, latitude and longitude.
pub type GlideRing = (f64, f64, Vec<(f64, f64)>);

/// The glide ring: its radius (motion::glide's still-air range at the picked airplane's own glide ratio) over the higher of
/// the ground under the airplane (the pack's terrain grid) and the nearest field's elevation, and its outline on the sphere
/// for a map that draws polygons. None on the ground, under flying speed, with no height or no glide ratio.
pub fn glide_ring(
    lat: f64, lon: f64, altitude_ft: Option<f64>, speed_kt: Option<f64>, terrain_ft: Option<f64>, field_ft: Option<f64>,
    glide_ratio: Option<f64>,
) -> Option<GlideRing> {
    // The higher ground of the two: the ring is how far the airplane
    // glides before it meets it, so the lower would draw it too wide.
    let ground = match (terrain_ft, field_ft) {
        (Some(t), Some(f)) => Some(t.max(f)),
        (t, f) => t.or(f),
    };
    let range = range_nm(altitude_ft, speed_kt, ground, glide_ratio)?;
    let ring = (0..=RING_POINTS).map(|k| destination(lat, lon, 360.0 * (k % RING_POINTS) as f64 / RING_POINTS as f64, range)).collect();
    Some((range, ground?, ring))
}

/// `glide_ring`: `{"range_nm", "ground_ft", "ring": [[lat, lon]]}` or null, from `{"lat", "lon", "altitude_ft"?,
/// "speed_kt"?, "terrain_ft"?, "field_ft"?, "glide_ratio"?}`.
pub(super) fn ring_rule(v: &Value) -> Result<String, String> {
    let n = "glide_ring";
    let Some((range, ground, ring)) = glide_ring(
        num(n, v, "lat")?,
        num(n, v, "lon")?,
        opt(n, v, "altitude_ft")?,
        opt(n, v, "speed_kt")?,
        opt(n, v, "terrain_ft")?,
        opt(n, v, "field_ft")?,
        opt(n, v, "glide_ratio")?,
    ) else {
        return Ok("null".to_owned());
    };
    let mut out = String::from("{\"range_nm\":");
    json::number(&mut out, range);
    out.push_str(",\"ground_ft\":");
    json::number(&mut out, ground);
    out.push_str(",\"ring\":[");
    for (k, (lat, lon)) in ring.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push('[');
        json::number(&mut out, *lat);
        out.push(',');
        json::number(&mut out, *lon);
        out.push(']');
    }
    out.push_str("]}");
    Ok(out)
}

/// `glide_range`: nm or null, from `{"altitude_ft"?, "speed_kt"?,
/// "ground_ft"?, "glide_ratio"?}` -- the ratio the picked airplane's
/// profile gives, none with no airplane or none in its profile.
pub(super) fn range_rule(v: &Value) -> Result<String, String> {
    let n = "glide_range";
    let mut out = String::new();
    json::opt_number(
        &mut out,
        range_nm(opt(n, v, "altitude_ft")?, opt(n, v, "speed_kt")?, opt(n, v, "ground_ft")?, opt(n, v, "glide_ratio")?),
    );
    Ok(out)
}

/// `glide_reaches`: true or false, from `{"altitude_ft"?, "speed_kt"?,
/// "distance_nm", "elevation_ft"?, "glide_ratio"?}`.
pub(super) fn reaches_rule(v: &Value) -> Result<String, String> {
    let n = "glide_reaches";
    let distance = opt(n, v, "distance_nm")?.ok_or("glide_reaches: \"distance_nm\" is missing")?;
    let yes = reaches(opt(n, v, "altitude_ft")?, opt(n, v, "speed_kt")?, distance, opt(n, v, "elevation_ft")?, opt(n, v, "glide_ratio")?);
    Ok(if yes { "true" } else { "false" }.to_owned())
}

/// `underway`: true or false, from `{"speed_kt"?}`.
pub(super) fn underway_rule(v: &Value) -> Result<String, String> {
    Ok(if underway(opt("underway", v, "speed_kt")?) { "true" } else { "false" }.to_owned())
}
